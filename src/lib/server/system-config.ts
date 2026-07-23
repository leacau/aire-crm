import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { defaultPermissions } from '@/lib/data';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type {
  AreaType,
  ObjectiveVisibilityConfig,
  OpportunityAlertsConfig,
  SasProductConfig,
  ScreenName,
  ScreenPermission,
} from '@/lib/types';

const SYSTEM_CONFIG_COLLECTION = 'system_config';

export const AREA_PERMISSIONS_DOC_ID = 'area_permissions';
export const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';
export const HOLIDAYS_DOC_ID = 'holidays';
export const OBJECTIVE_VISIBILITY_DOC_ID = 'objective_visibility';
export const OPPORTUNITY_ALERTS_DOC_ID = 'opportunity_alerts';
export const SRL_AD_TYPES_DOC_ID = 'srl_ad_types';
export const SAS_PRODUCTS_DOC_ID = 'sas_products';

export const DEFAULT_SRL_AD_TYPES = ['Spot', 'PNT', 'Auspicio', 'Nota Comercial', 'Sorteo', 'Juego'];

export type AreaPermissions = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

export class SystemConfigApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function getRequesterName(requester: ServerUser) {
  return requester.name || requester.email || 'Usuario';
}

async function getSystemConfigDoc<T>(docId: string, field: string, fallback: T): Promise<T> {
  const snap = await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(docId).get();
  return snap.exists ? (snap.data()?.[field] as T) : fallback;
}

async function saveSystemConfigDoc<T extends Record<string, unknown>>(
  docId: string,
  data: T,
  requester: ServerUser,
  activity: { entityName: string; details: string },
): Promise<void> {
  await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(docId).set(data, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'system_config',
    entityId: docId,
    entityName: activity.entityName,
    details: activity.details,
    ownerName: 'Sistema',
  });
}

export function normalizeEmails(rawEmails: unknown): string[] {
  return Array.isArray(rawEmails)
    ? rawEmails.map((email: unknown) => String(email).trim().toLowerCase()).filter(Boolean)
    : [];
}

export function normalizeAreaPermissions(rawPermissions: unknown): AreaPermissions {
  return rawPermissions && typeof rawPermissions === 'object'
    ? rawPermissions as AreaPermissions
    : defaultPermissions;
}

export function normalizeHolidayDates(rawDates: unknown): string[] {
  if (!Array.isArray(rawDates)) return [];

  const seen = new Set<string>();
  return rawDates
    .map(date => String(date).trim().slice(0, 10))
    .filter(date => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) return false;
      seen.add(date);
      return true;
    })
    .sort();
}

export function normalizeSrlAdTypes(rawTypes: unknown): string[] {
  if (!Array.isArray(rawTypes)) return DEFAULT_SRL_AD_TYPES;

  const seen = new Set<string>();
  return rawTypes
    .map(type => String(type).trim())
    .filter(type => {
      if (!type || seen.has(type.toLowerCase())) return false;
      seen.add(type.toLowerCase());
      return true;
    });
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSasProducts(rawProducts: unknown): SasProductConfig[] {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.map((product, index) => {
    const item = product && typeof product === 'object' ? product as Partial<SasProductConfig> : {};
    return {
      id: String(item.id || `product-${index}`),
      format: String(item.format || '').trim(),
      type: String(item.type || '').trim(),
      detail: String(item.detail || '').trim(),
      unitRate: normalizeNumber(item.unitRate),
      cpm: normalizeNumber(item.cpm),
    };
  }).filter(product => product.id && product.format);
}

export function normalizeOpportunityAlertsConfig(rawConfig: unknown): OpportunityAlertsConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  return Object.fromEntries(
    Object.entries(rawConfig as Record<string, unknown>)
      .map(([key, value]) => [key, Number(value)])
      .filter(([, value]) => Number.isFinite(value)),
  ) as OpportunityAlertsConfig;
}

export function normalizeObjectiveVisibilityConfig(rawConfig: unknown): ObjectiveVisibilityConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  const data = rawConfig as ObjectiveVisibilityConfig;
  return {
    activeMonthKey: typeof data.activeMonthKey === 'string' ? data.activeMonthKey : undefined,
    visibleUntil: typeof data.visibleUntil === 'string' ? data.visibleUntil : undefined,
    updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

export async function getAreaPermissionsServer(): Promise<AreaPermissions> {
  const docRef = dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(AREA_PERMISSIONS_DOC_ID);
  const snap = await docRef.get();

  if (snap.exists) {
    return normalizeAreaPermissions(snap.data()?.permissions);
  }

  await docRef.set({ permissions: defaultPermissions });
  return defaultPermissions;
}

export async function saveAreaPermissionsServer(
  rawPermissions: unknown,
): Promise<AreaPermissions> {
  if (!rawPermissions || typeof rawPermissions !== 'object') {
    throw new SystemConfigApiError('Permissions payload is required', 400);
  }

  const permissions = normalizeAreaPermissions(rawPermissions);
  await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(AREA_PERMISSIONS_DOC_ID).set({ permissions }, { merge: true });
  return permissions;
}

export async function getEmailWhitelistServer(): Promise<string[]> {
  return normalizeEmails(await getSystemConfigDoc(EMAIL_WHITELIST_DOC_ID, 'emails', []));
}

export async function saveEmailWhitelistServer(rawEmails: unknown, requester: ServerUser): Promise<string[]> {
  const emails = normalizeEmails(rawEmails);
  await saveSystemConfigDoc(
    EMAIL_WHITELIST_DOC_ID,
    { emails },
    requester,
    {
      entityName: 'Lista Blanca de Accesos',
      details: 'actualizo los correos autorizados para ingresar al sistema.',
    },
  );
  return emails;
}

export async function getHolidayDatesServer(): Promise<string[]> {
  return normalizeHolidayDates(await getSystemConfigDoc(HOLIDAYS_DOC_ID, 'dates', []));
}

export async function saveHolidayDatesServer(rawDates: unknown, requester: ServerUser): Promise<string[]> {
  if (!Array.isArray(rawDates)) {
    throw new SystemConfigApiError('La lista de feriados es obligatoria.', 400);
  }

  const dates = normalizeHolidayDates(rawDates);
  await saveSystemConfigDoc(
    HOLIDAYS_DOC_ID,
    { dates },
    requester,
    {
      entityName: 'Feriados',
      details: 'actualizo la lista de feriados del sistema.',
    },
  );
  return dates;
}

export async function getSrlAdTypesServer(): Promise<string[]> {
  return normalizeSrlAdTypes(await getSystemConfigDoc(SRL_AD_TYPES_DOC_ID, 'types', DEFAULT_SRL_AD_TYPES));
}

export async function saveSrlAdTypesServer(rawTypes: unknown, requester: ServerUser): Promise<string[]> {
  if (!Array.isArray(rawTypes)) {
    throw new SystemConfigApiError('La lista de formatos es obligatoria.', 400);
  }

  const types = normalizeSrlAdTypes(rawTypes);
  await saveSystemConfigDoc(
    SRL_AD_TYPES_DOC_ID,
    { types },
    requester,
    {
      entityName: 'Tipos de Aviso SRL',
      details: 'actualizo la lista de formatos comerciales de Radio/TV.',
    },
  );
  return types;
}

export async function getSasProductsServer(): Promise<SasProductConfig[]> {
  return normalizeSasProducts(await getSystemConfigDoc(SAS_PRODUCTS_DOC_ID, 'products', []));
}

export async function saveSasProductsServer(
  rawProducts: unknown,
  requester: ServerUser,
): Promise<SasProductConfig[]> {
  if (!Array.isArray(rawProducts)) {
    throw new SystemConfigApiError('La lista de productos es obligatoria.', 400);
  }

  const products = normalizeSasProducts(rawProducts);
  await saveSystemConfigDoc(
    SAS_PRODUCTS_DOC_ID,
    { products },
    requester,
    {
      entityName: 'Productos Digitales SAS',
      details: 'actualizo el tarifario de productos digitales.',
    },
  );
  return products;
}

export async function getOpportunityAlertsConfigServer(): Promise<OpportunityAlertsConfig> {
  const snap = await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(OPPORTUNITY_ALERTS_DOC_ID).get();
  return snap.exists ? normalizeOpportunityAlertsConfig(snap.data()) : {};
}

export async function saveOpportunityAlertsConfigServer(
  rawConfig: unknown,
  requester: ServerUser,
): Promise<OpportunityAlertsConfig> {
  const config = normalizeOpportunityAlertsConfig(rawConfig);

  await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(OPPORTUNITY_ALERTS_DOC_ID).set(config, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'opportunity_alerts_config',
    entityId: OPPORTUNITY_ALERTS_DOC_ID,
    entityName: 'Configuracion de Alertas de Oportunidades',
    details: 'actualizo la configuracion de alertas de oportunidades.',
    ownerName: getRequesterName(requester),
  });

  return config;
}

export async function getObjectiveVisibilityConfigServer(): Promise<ObjectiveVisibilityConfig> {
  const snap = await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(OBJECTIVE_VISIBILITY_DOC_ID).get();
  return snap.exists
    ? normalizeObjectiveVisibilityConfig(serializeDocument<ObjectiveVisibilityConfig>(snap.id, snap.data()))
    : {};
}

export async function saveObjectiveVisibilityConfigServer(
  rawConfig: unknown,
  requester: ServerUser,
): Promise<ObjectiveVisibilityConfig> {
  const config = normalizeObjectiveVisibilityConfig(rawConfig);

  await dbAdmin.collection(SYSTEM_CONFIG_COLLECTION).doc(OBJECTIVE_VISIBILITY_DOC_ID).set({
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByName: getRequesterName(requester),
  }, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'system_config',
    entityId: OBJECTIVE_VISIBILITY_DOC_ID,
    entityName: 'Visibilidad de objetivos',
    details: 'actualizo la fecha de visibilidad de objetivos.',
    ownerName: getRequesterName(requester),
  });

  return config;
}
