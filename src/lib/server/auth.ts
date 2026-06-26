import { NextResponse } from 'next/server';

import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import type { ModuleCapability } from '@/core/modules';
import { defaultPermissions } from '@/lib/data';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import type { AreaType, ScreenName, ScreenPermission } from '@/lib/types';

export type ServerUser = {
  uid: string;
  organizationId: string;
  email?: string;
  name: string;
  role?: string;
  area?: AreaType;
  permissions?: Partial<Record<ScreenName, ScreenPermission>>;
};

const moduleScreenMap: Partial<Record<ModuleCapability, ScreenName>> = {
  'clients.read': 'Clients',
  'clients.create': 'Clients',
  'clients.update': 'Clients',
  'clients.delete': 'Clients',
  'clients.import': 'Clients',
  'clients.export': 'Clients',
  'opportunities.read': 'Opportunities',
  'opportunities.create': 'Opportunities',
  'opportunities.update': 'Opportunities',
  'opportunities.delete': 'Opportunities',
  'opportunities.approve': 'Opportunities',
  'tasks.read': 'Tasks',
  'tasks.create': 'Tasks',
  'tasks.update': 'Tasks',
  'tasks.delete': 'Tasks',
  'prospects.read': 'Prospects',
  'prospects.create': 'Prospects',
  'prospects.update': 'Prospects',
  'prospects.delete': 'Prospects',
  'prospects.approve': 'Prospects',
  'prospects.export': 'Prospects',
  'billing.read': 'Billing',
  'billing.create': 'Billing',
  'billing.update': 'Billing',
  'billing.delete': 'Billing',
  'billing.approve': 'Billing',
  'billing.import': 'Billing',
  'billing.export': 'Billing',
};

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function requireServerUser(request: Request): Promise<ServerUser | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Falta el token de autenticación.' }, { status: 401 });
  }

  let decoded;
  
  // 1. Verificación del Token
  try {
    decoded = await authAdmin.verifyIdToken(token);
  } catch (error) {
    console.error('🔥 [AUTH] Error verificando el Token de Firebase:', error);
    return NextResponse.json({ error: 'El token de autenticación no es válido o ha expirado.' }, { status: 401 });
  }

  // 2. Extracción de Perfil de la Base de Datos
  let profile: any = {};
  try {
    const userSnap = await dbAdmin.collection('users').doc(decoded.uid).get();
    if (userSnap.exists) {
      profile = userSnap.data();
    }
  } catch (error) {
    console.error('🔥 [AUTH] Error obteniendo el perfil de Firestore (posible timeout/cold start):', error);
  }

  const tokenOrganizationId = typeof decoded.organizationId === 'string' && decoded.organizationId.length > 0
    ? decoded.organizationId
    : undefined;

  // Garantizamos acceso de superusuario para Leandro incluso si la DB falla temporalmente en el inicio
  const isSuperAdminFallback = decoded.email === 'lchena@airedesantafe.com.ar' || decoded.email === 'leandrochena@gmail.com';

  return {
    uid: decoded.uid,
    // 🟢 FORZAMOS SIEMPRE UN STRING VÁLIDO. SI TODO FALLA, USA EL DEFAULT.
    organizationId: profile?.organizationId || tokenOrganizationId || DEFAULT_ORGANIZATION_ID,
    email: decoded.email,
    name: profile?.name || decoded.name || decoded.email || 'Usuario',
    role: profile?.role || (isSuperAdminFallback ? 'Gerencia' : undefined),
    area: profile?.area,
    permissions: profile?.permissions,
  };
}

export function isServerResponse(value: ServerUser | NextResponse): value is NextResponse {
  // 🟢 CORRECCIÓN CRÍTICA: En Node.js runtime de Next.js, `instanceof NextResponse` suele fallar por referencias cruzadas.
  // Es muchísimo más seguro verificar que el objeto devuelto NO tenga la propiedad 'uid' (propia del ServerUser).
  return !('uid' in value);
}

export function hasServerManagementPrivileges(user: ServerUser): boolean {
  if (user.email?.toLowerCase() === 'lchena@airedesantafe.com.ar' || user.email?.toLowerCase() === 'leandrochena@gmail.com') return true;
  return user.role === 'Jefe' || user.role === 'Gerencia' || user.role === 'Administracion' || user.role === 'Admin';
}

type AreaPermissions = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

export function hasScreenPermission(
  user: ServerUser,
  screen: ScreenName,
  permission: keyof ScreenPermission,
  areaPermissions: AreaPermissions = defaultPermissions,
): boolean {
  if (hasServerManagementPrivileges(user)) return true;

  const userOverride = user.permissions?.[screen];
  if (userOverride) return userOverride[permission] === true;

  const effectiveArea = user.area
    || (user.role === 'Asesor' ? 'Comercial' : undefined)
    || (user.role === 'Asesor Canjes' ? 'Canjes' : undefined);
  if (!effectiveArea) return false;
  const configuredPermission = areaPermissions[effectiveArea]?.[screen];
  if (configuredPermission) return configuredPermission[permission] === true;

  return defaultPermissions[effectiveArea]?.[screen]?.[permission] === true;
}

async function getConfiguredAreaPermissions(): Promise<AreaPermissions> {
  try {
    const snapshot = await dbAdmin.collection('system_config').doc('area_permissions').get();
    if (!snapshot.exists) return defaultPermissions;
    return { ...defaultPermissions, ...(snapshot.data() as Partial<AreaPermissions>) } as AreaPermissions;
  } catch {
    return defaultPermissions;
  }
}

export async function hasServerCapability(
  user: ServerUser,
  capability: ModuleCapability,
): Promise<boolean> {
  return (await getGrantedServerCapabilities(user, [capability])).includes(capability);
}

export async function getGrantedServerCapabilities(
  user: ServerUser,
  capabilities: readonly ModuleCapability[],
): Promise<ModuleCapability[]> {
  const areaPermissions = hasServerManagementPrivileges(user)
    ? defaultPermissions
    : await getConfiguredAreaPermissions();

  return capabilities.filter(capability => {
    const screen = moduleScreenMap[capability];
    if (!screen) return false;
    const permission = capability.endsWith('.read') ? 'view' : 'edit';
    if (capability.startsWith('billing.')) {
      return hasScreenPermission(user, 'Billing', permission, areaPermissions)
        || hasScreenPermission(user, 'BillingRequests', permission, areaPermissions);
    }
    return hasScreenPermission(user, screen, permission, areaPermissions);
  });
}

export async function requireServerCapability(
  request: Request,
  capability: ModuleCapability,
): Promise<ServerUser | NextResponse> {
  const user = await requireServerUser(request);
  if (isServerResponse(user)) return user;
  
  if (!(await hasServerCapability(user, capability))) {
    return NextResponse.json(
      { error: 'No tienes permiso para realizar esta acción.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }
  return user;
}

export async function requireServerManagement(request: Request): Promise<ServerUser | NextResponse> {
  const user = await requireServerUser(request);
  if (isServerResponse(user)) return user;
  
  if (!hasServerManagementPrivileges(user)) {
    return NextResponse.json({ error: 'No tienes permisos de gestión.', code: 'FORBIDDEN' }, { status: 403 });
  }
  return user;
}
