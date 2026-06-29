import { format, parseISO } from 'date-fns';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/server/api-error';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { listClientIdsForOrganization } from '@/modules/clients/server-index';
import type { Opportunity, OpportunityPeriod, OpportunityStage, OrdenPautado } from '../../domain/opportunity';
import type { CreateOpportunityInput, UpdateOpportunityInput } from '../../application/opportunity-schemas';

type UpdateOptions = { manageContractPeriods?: boolean };
type PendingInvoiceInput = Record<string, unknown>;

const opportunitiesCollection = dbAdmin.collection('opportunities');
const clientsCollection = dbAdmin.collection('clients');
const invoicesCollection = dbAdmin.collection('invoices');
const commercialItemsCollection = dbAdmin.collection('commercial_items');
const programsCollection = dbAdmin.collection('programs');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => removeUndefinedDeep(item)) as T;
  }
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)]),
  ) as T;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseDateOrThrow(value: string, message: string): Date {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, message, 'INVALID_DATE');
  return parsed;
}

function validateContractDates(
  resultingStage: string | undefined,
  originalStage: string | undefined,
  nextStartDate?: string,
  nextEndDate?: string,
  requireWonDatesOnCreate = false,
) {
  if (resultingStage === 'Ganado (Recurrente)') {
    throw new ApiError(400, 'Ganado (Recurrente) es un estado visual del Kanban y no puede guardarse.', 'INVALID_OPPORTUNITY_STAGE');
  }

  const isTransitioningToWon = resultingStage === 'Cerrado - Ganado' && originalStage !== 'Cerrado - Ganado';
  if ((requireWonDatesOnCreate || isTransitioningToWon) && (!nextStartDate || !nextEndDate)) {
    throw new ApiError(
      400,
      'La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.',
      'OPPORTUNITY_CONTRACT_DATES_REQUIRED',
    );
  }
  if (!!nextStartDate !== !!nextEndDate) {
    throw new ApiError(400, 'La fecha de inicio y fin de la vigencia deben cargarse juntas.', 'INVALID_CONTRACT_DATES');
  }
  if (nextStartDate && nextEndDate) {
    const start = parseDateOrThrow(nextStartDate, 'La fecha de inicio del contrato no es válida.');
    const end = parseDateOrThrow(nextEndDate, 'La fecha de fin del contrato no es válida.');
    if (end < start) {
      throw new ApiError(400, 'La fecha de fin del contrato no puede ser anterior a la fecha de inicio.', 'INVALID_CONTRACT_DATES');
    }
  }
}

function belongsToOrganization(
  data: FirebaseFirestore.DocumentData,
  organizationId: string,
  clientIds: Set<string>,
): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  if (data.clientId && clientIds.has(data.clientId)) return true;
  return organizationId === DEFAULT_ORGANIZATION_ID && !data.clientId;
}

async function getClientOwnerName(clientId: string): Promise<string> {
  const snapshot = await clientsCollection.doc(clientId).get();
  if (!snapshot.exists) return 'N/A';
  const data = snapshot.data() || {};
  return typeof data.ownerName === 'string' ? data.ownerName : 'N/A';
}

async function assertClientInOrganization(clientId: string, organizationId: string) {
  const [snapshot, clientIds] = await Promise.all([
    clientsCollection.doc(clientId).get(),
    listClientIdsForOrganization(organizationId),
  ]);
  if (!snapshot.exists || !clientIds.has(clientId)) {
    throw new ApiError(404, 'El cliente no existe.', 'CLIENT_NOT_FOUND');
  }
}

async function getOpportunityForWrite(id: string, organizationId: string) {
  const [snapshot, clientIds] = await Promise.all([
    opportunitiesCollection.doc(id).get(),
    listClientIdsForOrganization(organizationId),
  ]);
  if (!snapshot.exists || !belongsToOrganization(snapshot.data() || {}, organizationId, clientIds)) {
    throw new ApiError(404, 'La oportunidad no existe.', 'OPPORTUNITY_NOT_FOUND');
  }
  return snapshot.data() as Opportunity;
}

function toLocalDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

async function createCommercialItemsFromOpportunity(
  opportunity: Opportunity,
  user: ServerUser,
): Promise<void> {
  if (!opportunity.ordenesPautado?.length) return;

  const programSnapshot = await programsCollection.get();
  const programsByName = new Map(
    programSnapshot.docs.map(document => [document.data().name, document.id] as const),
  );

  const batch = dbAdmin.batch();
  let createdCount = 0;

  for (const orden of opportunity.ordenesPautado as OrdenPautado[]) {
    if (!orden.fechaInicio || !orden.fechaFin || !orden.programas?.length) continue;
    const startDate = toLocalDate(orden.fechaInicio);
    const endDate = toLocalDate(orden.fechaFin);
    if (!startDate || !endDate) continue;

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
      if (orden.dias?.includes(dayOfWeek)) {
        for (const programName of orden.programas) {
          const programId = programsByName.get(programName);
          if (!programId) continue;
          for (let index = 0; index < (orden.repeticiones || 1); index += 1) {
            const itemRef = commercialItemsCollection.doc();
            batch.set(itemRef, {
              programId,
              date: format(currentDate, 'yyyy-MM-dd'),
              type: orden.tipoPauta === 'Spot' ? 'Pauta' : orden.tipoPauta,
              title: orden.tipoPauta === 'PNT' ? orden.textoPNT || opportunity.title : opportunity.title,
              description: orden.textoPNT || opportunity.title,
              status: 'Vendido',
              clientId: opportunity.clientId,
              clientName: opportunity.clientName,
              opportunityId: opportunity.id,
              opportunityTitle: opportunity.title,
              createdBy: user.uid,
              createdAt: FieldValue.serverTimestamp(),
            });
            createdCount += 1;
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  if (createdCount === 0) return;

  await batch.commit();
  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'create',
    entityType: 'commercial_item_series',
    entityId: opportunity.id,
    entityName: opportunity.title,
    details: `generó <strong>${createdCount}</strong> pautas comerciales desde la oportunidad <strong>${opportunity.title}</strong>`,
    ownerName: user.name,
    organizationId: user.organizationId,
  });
}

async function createPendingInvoices(
  opportunityId: string,
  pendingInvoices: PendingInvoiceInput[] | undefined,
): Promise<void> {
  if (!pendingInvoices?.length) return;

  const batch = dbAdmin.batch();
  pendingInvoices.forEach(invoice => {
    const invoiceRef = invoicesCollection.doc();
    batch.set(invoiceRef, removeUndefinedDeep({
      ...invoice,
      opportunityId,
      dateGenerated: new Date().toISOString(),
      isCreditNote: invoice.isCreditNote ?? false,
      creditNoteMarkedAt: invoice.creditNoteMarkedAt ?? null,
      markedForDeletion: invoice.markedForDeletion ?? false,
      deletionMarkedAt: invoice.deletionMarkedAt ?? null,
      deletionMarkedById: invoice.deletionMarkedById ?? null,
      deletionMarkedByName: invoice.deletionMarkedByName ?? null,
      periodStart: invoice.periodStart ?? null,
      periodEnd: invoice.periodEnd ?? null,
      orderDate: invoice.orderDate ?? null,
      orderNumber: invoice.orderNumber ?? null,
    }));
  });
  await batch.commit();
}

export async function createOpportunityForOrganization(
  input: CreateOpportunityInput,
  user: ServerUser,
): Promise<string> {
  validateContractDates(input.stage, undefined, input.startDate, input.endDate, input.stage === 'Cerrado - Ganado');
  await assertClientInOrganization(input.clientId, user.organizationId);

  const dataToSave = removeUndefinedDeep({
    ...input,
    organizationId: input.organizationId || user.organizationId,
    createdAt: FieldValue.serverTimestamp(),
    stageChangedAt: FieldValue.serverTimestamp(),
    pautados: undefined,
  });
  if ((dataToSave as Record<string, unknown>).agencyId === '') delete (dataToSave as Record<string, unknown>).agencyId;

  const document = await opportunitiesCollection.add(dataToSave);

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'create',
    entityType: 'opportunity',
    entityId: document.id,
    entityName: input.title,
    details: `creó la oportunidad <strong>${input.title}</strong> para el cliente <a href="/clients/${input.clientId}" class="font-bold text-primary hover:underline">${input.clientName}</a>`,
    ownerName: await getClientOwnerName(input.clientId),
    organizationId: user.organizationId,
  });

  return document.id;
}

export async function updateOpportunityForOrganization(
  id: string,
  data: UpdateOpportunityInput,
  user: ServerUser,
  pendingInvoices?: PendingInvoiceInput[],
  options?: UpdateOptions,
): Promise<Partial<Opportunity>> {
  const originalData = await getOpportunityForWrite(id, user.organizationId);

  const resultingStage = data.stage || originalData.stage;
  const hasStartDateUpdate = hasOwn(data, 'startDate');
  const hasEndDateUpdate = hasOwn(data, 'endDate');
  const nextStartDate = hasStartDateUpdate ? data.startDate : originalData.startDate;
  const nextEndDate = hasEndDateUpdate ? data.endDate : originalData.endDate;

  validateContractDates(resultingStage, originalData.stage, nextStartDate, nextEndDate);

  if (
    !options?.manageContractPeriods
    && originalData.startDate
    && originalData.endDate
    && ((typeof data.startDate === 'string' && data.startDate !== originalData.startDate)
      || (typeof data.endDate === 'string' && data.endDate !== originalData.endDate))
  ) {
    throw new ApiError(400, 'La vigencia inicial ya fue confirmada. Para extenderla, usá Renovar período.', 'INITIAL_VALIDITY_LOCKED');
  }

  await assertClientInOrganization(data.clientId || originalData.clientId, user.organizationId);

  const updateData: Record<string, unknown> = removeUndefinedDeep({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (options?.manageContractPeriods && hasStartDateUpdate && !data.startDate) updateData.startDate = FieldValue.delete();
  if (options?.manageContractPeriods && hasEndDateUpdate && !data.endDate) updateData.endDate = FieldValue.delete();

  const originalHistory = Array.isArray(originalData.periodHistory) ? originalData.periodHistory : [];
  const submittedHistory = Array.isArray(data.periodHistory) ? data.periodHistory : originalHistory;
  if (options?.manageContractPeriods && Array.isArray(data.periodHistory)) {
    updateData.periodHistory = data.periodHistory;
  }
  const periodDateKey = (period: { startDate: string; endDate: string }) =>
    `${String(period.startDate).slice(0, 10)}|${String(period.endDate).slice(0, 10)}`;
  const newRenewals = options?.manageContractPeriods
    ? []
    : submittedHistory.filter(period => !originalHistory.some(existing => periodDateKey(existing) === periodDateKey(period)));
  const occupiedPeriods = [
    ...(nextStartDate && nextEndDate ? [{ startDate: nextStartDate, endDate: nextEndDate }] : []),
    ...(options?.manageContractPeriods ? [] : originalHistory),
  ];
  const periodsToValidate = options?.manageContractPeriods && Array.isArray(data.periodHistory)
    ? data.periodHistory
    : newRenewals;

  periodsToValidate.forEach(period => {
    if (!period.startDate || !period.endDate || parseISO(period.endDate) < parseISO(period.startDate)) {
      throw new ApiError(400, 'La renovación contiene una vigencia inválida.', 'INVALID_RENEWAL_PERIOD');
    }
    const periodStart = String(period.startDate).slice(0, 10);
    const periodEnd = String(period.endDate).slice(0, 10);
    const conflict = occupiedPeriods.find(existing => {
      const existingStart = String(existing.startDate).slice(0, 10);
      const existingEnd = String(existing.endDate).slice(0, 10);
      return periodStart <= existingEnd && periodEnd >= existingStart;
    });
    if (conflict) {
      throw new ApiError(
        400,
        `La renovación se superpone con la vigencia ${String(conflict.startDate).slice(0, 10)} al ${String(conflict.endDate).slice(0, 10)}.`,
        'RENEWAL_PERIOD_OVERLAP',
      );
    }
    occupiedPeriods.push(period);
  });

  const isRenewal = newRenewals.length > 0;
  if (Array.isArray(data.periodHistory) && !options?.manageContractPeriods) {
    updateData.periodHistory = [...originalHistory, ...newRenewals];
  }
  if (isRenewal) {
    updateData.lastRenewedAt = FieldValue.serverTimestamp();
    updateData.lastRenewedById = user.uid;
    updateData.lastRenewedByName = user.name;
    updateData.finalizationDate = FieldValue.delete();
  }
  if (!originalData.startDate && !originalData.endDate && nextStartDate && nextEndDate) {
    updateData.initialValidityConfirmedAt = FieldValue.serverTimestamp();
    updateData.initialValidityConfirmedById = user.uid;
    updateData.initialValidityConfirmedByName = user.name;
  }
  if (hasOwn(data, 'finalizationDate') && !data.finalizationDate) {
    updateData.finalizationDate = FieldValue.delete();
  }

  delete updateData.manualUpdateHistory;

  const stageChanged = Boolean(data.stage && data.stage !== originalData.stage);
  if (stageChanged) updateData.stageChangedAt = FieldValue.serverTimestamp();

  if (hasOwn(data, 'manualUpdateDate')) {
    if (!data.manualUpdateDate) {
      updateData.manualUpdateDate = FieldValue.delete();
    } else if (data.manualUpdateDate !== originalData.manualUpdateDate) {
      updateData.manualUpdateDate = data.manualUpdateDate;
      updateData.manualUpdateHistory = FieldValue.arrayUnion(data.manualUpdateDate);
    } else {
      delete updateData.manualUpdateDate;
    }
  }

  const bonusStateChanged = data.bonificacionEstado
    && data.bonificacionEstado !== originalData.bonificacionEstado
    && originalData.bonificacionEstado === 'Pendiente';
  if (bonusStateChanged && originalData.stage === 'Negociación a Aprobar') {
    updateData.stage = 'Negociación';
  }

  if (data.stage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado') {
    await createCommercialItemsFromOpportunity({ ...originalData, ...data, id } as Opportunity, user);
  }

  if (typeof data.bonificacionDetalle === 'string' && !data.bonificacionDetalle.trim()) {
    updateData.bonificacionEstado = FieldValue.delete();
    updateData.bonificacionAutorizadoPorId = FieldValue.delete();
    updateData.bonificacionAutorizadoPorNombre = FieldValue.delete();
    updateData.bonificacionFechaAutorizacion = FieldValue.delete();
  }
  if (data.agencyId === '' || data.agencyId === undefined) {
    updateData.agencyId = FieldValue.delete();
  }
  updateData.pautados = FieldValue.delete();
  if (typeof updateData.createdAt === 'string') {
    updateData.createdAt = Timestamp.fromDate(new Date(updateData.createdAt));
  }

  await opportunitiesCollection.doc(id).update(updateData);
  await createPendingInvoices(id, pendingInvoices);

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: stageChanged ? 'stage_change' : 'update',
    entityType: 'opportunity',
    entityId: id,
    entityName: originalData.title,
    details: stageChanged
      ? `cambió la etapa de <strong>${originalData.title}</strong> a <strong>${data.stage}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`
      : `actualizó la oportunidad <strong>${originalData.title}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`,
    ownerName: await getClientOwnerName(originalData.clientId),
    organizationId: user.organizationId,
  });

  const savedAt = new Date().toISOString();
  const cacheData: Partial<Opportunity> = { ...(data as Partial<Opportunity>), updatedAt: savedAt };
  if (Array.isArray(updateData.periodHistory)) cacheData.periodHistory = updateData.periodHistory as OpportunityPeriod[];
  if (typeof updateData.stage === 'string') cacheData.stage = updateData.stage as OpportunityStage;
  if (stageChanged) cacheData.stageChangedAt = savedAt;
  if (isRenewal || (hasOwn(data, 'finalizationDate') && !data.finalizationDate)) cacheData.finalizationDate = undefined;
  if (options?.manageContractPeriods && hasStartDateUpdate && !data.startDate) cacheData.startDate = undefined;
  if (options?.manageContractPeriods && hasEndDateUpdate && !data.endDate) cacheData.endDate = undefined;
  if (data.agencyId === '' || data.agencyId === undefined) cacheData.agencyId = undefined;
  if (hasOwn(data, 'manualUpdateDate') && !data.manualUpdateDate) cacheData.manualUpdateDate = undefined;
  return cacheData;
}

export async function deleteOpportunityForOrganization(
  id: string,
  user: ServerUser,
): Promise<void> {
  const opportunity = await getOpportunityForWrite(id, user.organizationId);
  const invoicesSnapshot = await invoicesCollection.where('opportunityId', '==', id).get();

  const batch = dbAdmin.batch();
  invoicesSnapshot.forEach(document => batch.delete(document.ref));
  batch.delete(opportunitiesCollection.doc(id));
  await batch.commit();

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'delete',
    entityType: 'opportunity',
    entityId: id,
    entityName: opportunity.title,
    details: `eliminó la oportunidad <strong>${opportunity.title}</strong> del cliente ${opportunity.clientName}`,
    ownerName: await getClientOwnerName(opportunity.clientId),
    organizationId: user.organizationId,
  });
}
