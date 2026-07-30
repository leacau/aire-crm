import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { parseISO } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { cleanObject, mapClient } from '@/lib/server/clients';
import { getRequesterName } from '@/lib/server/requester';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Client, CommercialItem, Opportunity, Program } from '@/lib/types';

export class OpportunityApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function mapOpportunity(id: string, data: FirebaseFirestore.DocumentData | undefined): Opportunity {
  return serializeDocument<Opportunity>(id, data);
}

function dateFromYmd(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toYmd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function validateOpportunityDates(
  data: Partial<Omit<Opportunity, 'id'>>,
  originalData: Opportunity,
  manageContractPeriods: boolean,
) {
  const resultingStage = data.stage || originalData.stage;
  const hasStartDateUpdate = Object.prototype.hasOwnProperty.call(data, 'startDate');
  const hasEndDateUpdate = Object.prototype.hasOwnProperty.call(data, 'endDate');
  const nextStartDate = hasStartDateUpdate ? data.startDate : originalData.startDate;
  const nextEndDate = hasEndDateUpdate ? data.endDate : originalData.endDate;
  const isTransitioningToWon = resultingStage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado';

  if (isTransitioningToWon && (!nextStartDate || !nextEndDate)) {
    throw new OpportunityApiError('La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.', 400);
  }
  if (!!nextStartDate !== !!nextEndDate) {
    throw new OpportunityApiError('La fecha de inicio y fin de la vigencia deben cargarse juntas.', 400);
  }
  if (nextStartDate && nextEndDate && parseISO(nextEndDate) < parseISO(nextStartDate)) {
    throw new OpportunityApiError('La fecha de fin del contrato no puede ser anterior a la fecha de inicio.', 400);
  }
  if (
    !manageContractPeriods
    && originalData.startDate
    && originalData.endDate
    && ((typeof data.startDate === 'string' && data.startDate !== originalData.startDate)
      || (typeof data.endDate === 'string' && data.endDate !== originalData.endDate))
  ) {
    throw new OpportunityApiError('La vigencia inicial ya fue confirmada. Para extenderla, usa Renovar periodo.', 400);
  }

  return { nextStartDate, nextEndDate };
}

function buildOpportunityUpdatePayload(
  data: Partial<Omit<Opportunity, 'id'>>,
  originalData: Opportunity,
  requesterName: string,
  requesterId: string,
  manageContractPeriods: boolean,
) {
  const { nextStartDate, nextEndDate } = validateOpportunityDates(data, originalData, manageContractPeriods);
  const hasStartDateUpdate = Object.prototype.hasOwnProperty.call(data, 'startDate');
  const hasEndDateUpdate = Object.prototype.hasOwnProperty.call(data, 'endDate');
  const originalHistory = Array.isArray(originalData.periodHistory) ? originalData.periodHistory : [];
  const submittedHistory = Array.isArray(data.periodHistory) ? data.periodHistory : originalHistory;

  const updateData: Record<string, unknown> = {
    ...cleanObject(data as Record<string, unknown>),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (manageContractPeriods && hasStartDateUpdate && !data.startDate) updateData.startDate = FieldValue.delete();
  if (manageContractPeriods && hasEndDateUpdate && !data.endDate) updateData.endDate = FieldValue.delete();

  if (
    (originalData.stage as string) === 'Ganado (Recurrente)'
    && Array.isArray(data.periodHistory)
    && data.periodHistory.length >= originalHistory.length
  ) {
    updateData.stage = 'Cerrado - Ganado';
  }

  const newRenewals = manageContractPeriods
    ? []
    : submittedHistory.filter(period => !originalHistory.some(existing => (
      existing.startDate === period.startDate
      && existing.endDate === period.endDate
      && Number(existing.value || 0) === Number(period.value || 0)
    )));

  const occupiedPeriods = [
    ...(nextStartDate && nextEndDate ? [{ startDate: nextStartDate, endDate: nextEndDate }] : []),
    ...(manageContractPeriods ? [] : originalHistory),
  ];
  const periodsToValidate = manageContractPeriods && Array.isArray(data.periodHistory) ? data.periodHistory : newRenewals;

  periodsToValidate.forEach(period => {
    if (!period.startDate || !period.endDate || parseISO(period.endDate) < parseISO(period.startDate)) {
      throw new OpportunityApiError('La renovacion contiene una vigencia invalida.', 400);
    }
    const overlaps = occupiedPeriods.some(existing => (
      period.startDate <= existing.endDate && period.endDate >= existing.startDate
    ));
    if (overlaps) throw new OpportunityApiError('La renovacion se superpone con una vigencia ya registrada.', 400);
    occupiedPeriods.push(period);
  });

  const isRenewal = newRenewals.length > 0;
  if (Array.isArray(data.periodHistory)) {
    updateData.periodHistory = manageContractPeriods ? data.periodHistory : [...originalHistory, ...newRenewals];
  }
  if (isRenewal) {
    updateData.lastRenewedAt = FieldValue.serverTimestamp();
    updateData.lastRenewedById = requesterId;
    updateData.lastRenewedByName = requesterName;
    updateData.finalizationDate = FieldValue.delete();
  }
  if (!originalData.startDate && !originalData.endDate && nextStartDate && nextEndDate) {
    updateData.initialValidityConfirmedAt = FieldValue.serverTimestamp();
    updateData.initialValidityConfirmedById = requesterId;
    updateData.initialValidityConfirmedByName = requesterName;
  }
  if ('finalizationDate' in data && !data.finalizationDate) {
    updateData.finalizationDate = FieldValue.delete();
  }
  if ('manualUpdateHistory' in updateData) {
    delete updateData.manualUpdateHistory;
  }

  const stageChanged = Boolean(data.stage && data.stage !== originalData.stage);
  if (stageChanged) {
    updateData.stageChangedAt = FieldValue.serverTimestamp();
  }

  if (typeof data.manualUpdateDate !== 'undefined') {
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
  if (bonusStateChanged && (originalData.stage as string) === 'Negociaci\u00f3n a Aprobar') {
    updateData.stage = 'Negociaci\u00f3n';
  }
  if (data.bonificacionDetalle !== undefined && !data.bonificacionDetalle.trim()) {
    updateData.bonificacionEstado = FieldValue.delete();
    updateData.bonificacionAutorizadoPorId = FieldValue.delete();
    updateData.bonificacionAutorizadoPorNombre = FieldValue.delete();
    updateData.bonificacionFechaAutorizacion = FieldValue.delete();
  }
  if (data.agencyId === '' || data.agencyId === undefined) {
    updateData.agencyId = FieldValue.delete();
  }
  if ('createdAt' in updateData && typeof updateData.createdAt === 'string') {
    updateData.createdAt = Timestamp.fromDate(new Date(updateData.createdAt));
  }

  updateData.pautados = FieldValue.delete();
  delete updateData.id;
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) delete updateData[key];
  });

  return {
    updateData,
    stageChanged,
    isRenewal,
    newRenewals,
  };
}

async function getActiveOpportunities() {
  const activeStages = [
    'Nuevo',
    'Propuesta',
    'Negociacion',
    'Negociaci\u00f3n',
    'Negociacion a Aprobar',
    'Negociaci\u00f3n a Aprobar',
    'Cerrado - No Definido',
    'Cerrado - Ganado',
  ];
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const snapshots = await Promise.all([
    ...activeStages.map(stage => dbAdmin.collection('opportunities').where('stage', '==', stage).get()),
    dbAdmin.collection('opportunities')
      .where('stage', '==', 'Cerrado - Perdido')
      .where('createdAt', '>=', threeMonthsAgo.toISOString())
      .get(),
  ]);

  const seen = new Set<string>();
  const opportunities: Opportunity[] = [];
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      opportunities.push(mapOpportunity(doc.id, doc.data()));
    });
  });

  return opportunities;
}

function isActiveOpportunityForList(opportunity: Opportunity, threeMonthsAgo: Date) {
  const activeStages = new Set([
    'Nuevo',
    'Propuesta',
    'Negociacion',
    'Negociación',
    'Negociacion a Aprobar',
    'Negociación a Aprobar',
    'Cerrado - No Definido',
    'Cerrado - Ganado',
  ]);

  if (activeStages.has(opportunity.stage)) return true;
  if (opportunity.stage !== 'Cerrado - Perdido') return false;

  const createdAt = opportunity.createdAt ? new Date(opportunity.createdAt) : null;
  return Boolean(createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= threeMonthsAgo);
}

async function getAllOpportunities() {
  const snapshot = await dbAdmin.collection('opportunities').get();
  return snapshot.docs.map(doc => mapOpportunity(doc.id, doc.data()));
}

async function getOpportunitiesForUser(userId: string) {
  const clientsSnap = await dbAdmin.collection('clients').where('ownerId', '==', userId).get();
  const clientIds = clientsSnap.docs.map(doc => doc.id);
  if (clientIds.length === 0) return [];

  const opportunities: Opportunity[] = [];
  for (let index = 0; index < clientIds.length; index += 30) {
    const chunk = clientIds.slice(index, index + 30);
    const snapshot = await dbAdmin.collection('opportunities').where('clientId', 'in', chunk).get();
    opportunities.push(...snapshot.docs.map(doc => mapOpportunity(doc.id, doc.data())));
  }

  return opportunities;
}

async function createCommercialItemsFromOpportunity(opportunity: Opportunity, requesterId: string, requesterName: string) {
  if (!opportunity.ordenesPautado || opportunity.ordenesPautado.length === 0) return 0;

  const programsSnap = await dbAdmin.collection('programs').get();
  const programsByName = new Map(
    programsSnap.docs.map(doc => {
      const program = serializeDocument<Program>(doc.id, doc.data());
      return [program.name, program];
    }),
  );
  const newItems: Omit<CommercialItem, 'id'>[] = [];

  for (const orden of opportunity.ordenesPautado) {
    if (!orden.fechaInicio || !orden.fechaFin || !orden.programas || orden.programas.length === 0) continue;

    const startDate = dateFromYmd(orden.fechaInicio);
    const endDate = dateFromYmd(orden.fechaFin);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
      if (orden.dias?.includes(dayOfWeek)) {
        for (const programName of orden.programas) {
          const program = programsByName.get(programName);
          if (!program) continue;

          for (let index = 0; index < (orden.repeticiones || 1); index += 1) {
            newItems.push({
              programId: program.id,
              date: toYmd(currentDate),
              type: orden.tipoPauta === 'Spot' ? 'Pauta' : orden.tipoPauta,
              title: orden.tipoPauta === 'PNT' ? orden.textoPNT || opportunity.title : opportunity.title,
              description: orden.textoPNT || opportunity.title,
              status: 'Vendido',
              clientId: opportunity.clientId,
              clientName: opportunity.clientName,
              opportunityId: opportunity.id,
              opportunityTitle: opportunity.title,
              createdBy: requesterId,
            });
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  for (let index = 0; index < newItems.length; index += 450) {
    const batch = dbAdmin.batch();
    newItems.slice(index, index + 450).forEach(itemData => {
      const itemRef = dbAdmin.collection('commercial_items').doc();
      batch.set(itemRef, { ...itemData, createdAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }

  if (newItems.length > 0) {
    await logServerActivity({
      userId: requesterId,
      userName: requesterName,
      type: 'create',
      entityType: 'commercial_item_series',
      entityId: opportunity.id,
      entityName: opportunity.title,
      details: `genero <strong>${newItems.length}</strong> pautas comerciales desde la oportunidad <strong>${opportunity.title}</strong>`,
      ownerName: requesterName,
    });
  }

  return newItems.length;
}

export async function listOpportunitiesServer(
  scope: string,
  userId: string | null,
  requester: ServerUser,
) {
  if (scope === 'all') {
    if (!hasServerManagementPrivileges(requester)) {
      return getOpportunitiesForUser(requester.uid);
    }
    return getAllOpportunities();
  }

  if (scope === 'user') {
    const requestedUserId = userId || requester.uid;
    if (requestedUserId !== requester.uid && !hasServerManagementPrivileges(requester)) {
      throw new OpportunityApiError('Forbidden', 403);
    }
    return getOpportunitiesForUser(requestedUserId);
  }

  if (scope === 'active' && !hasServerManagementPrivileges(requester)) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const opportunities = await getOpportunitiesForUser(requester.uid);
    return opportunities.filter(opportunity => isActiveOpportunityForList(opportunity, threeMonthsAgo));
  }

  return getActiveOpportunities();
}

export async function createOpportunityServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const opportunityData = body.opportunityData as Omit<Opportunity, 'id'> | undefined;

  if (!opportunityData?.clientId || !opportunityData.title) {
    throw new OpportunityApiError('Cliente y titulo son obligatorios.', 400);
  }

  if (opportunityData.stage === 'Cerrado - Ganado') {
    if (!opportunityData.startDate || !opportunityData.endDate) {
      throw new OpportunityApiError('La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.', 400);
    }
    if (parseISO(opportunityData.endDate) < parseISO(opportunityData.startDate)) {
      throw new OpportunityApiError('La fecha de fin del contrato no puede ser anterior a la fecha de inicio.', 400);
    }
  }

  const clientSnap = await dbAdmin.collection('clients').doc(opportunityData.clientId).get();
  if (!clientSnap.exists) {
    throw new OpportunityApiError('Cliente no encontrado para crear la oportunidad.', 404);
  }

  const client = mapClient(clientSnap.id, clientSnap.data());
  if (!hasServerManagementPrivileges(requester) && client.ownerId !== requester.uid) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  const dataToSave = cleanObject({
    ...(opportunityData as unknown as Record<string, unknown>),
    pautados: undefined,
    createdAt: FieldValue.serverTimestamp(),
    stageChangedAt: FieldValue.serverTimestamp(),
  });

  const docRef = await dbAdmin.collection('opportunities').add(dataToSave);
  const requesterName = getRequesterName(requester);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'opportunity',
    entityId: docRef.id,
    entityName: opportunityData.title,
    details: `creo la oportunidad <strong>${opportunityData.title}</strong> para el cliente <a href="/clients/${opportunityData.clientId}" class="font-bold text-primary hover:underline">${opportunityData.clientName}</a>`,
    ownerName: client.ownerName,
  });

  return docRef.id;
}

export async function getOpportunityServer(opportunityId: string) {
  const snap = await dbAdmin.collection('opportunities').doc(opportunityId).get();
  return snap.exists ? mapOpportunity(snap.id, snap.data()) : null;
}

export async function updateOpportunityServer(opportunityId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const data = (body.data || {}) as Partial<Omit<Opportunity, 'id'>>;
  const options = body.options && typeof body.options === 'object' ? body.options as Record<string, unknown> : {};
  const manageContractPeriods = Boolean(options.manageContractPeriods);

  const opportunityRef = dbAdmin.collection('opportunities').doc(opportunityId);
  const opportunitySnap = await opportunityRef.get();
  if (!opportunitySnap.exists) {
    throw new OpportunityApiError('Oportunidad no encontrada', 404);
  }

  const originalData = mapOpportunity(opportunitySnap.id, opportunitySnap.data());
  const clientSnap = await dbAdmin.collection('clients').doc(originalData.clientId).get();
  if (!clientSnap.exists) {
    throw new OpportunityApiError('Cliente no encontrado para actualizar la oportunidad.', 404);
  }

  const client = mapClient(clientSnap.id, clientSnap.data());
  const canManageOpportunity = hasServerManagementPrivileges(requester);
  const isClientOwner = client.ownerId === requester.uid;
  if (!canManageOpportunity && !isClientOwner) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  const changesClient =
    (data.clientId !== undefined && data.clientId !== originalData.clientId) ||
    (data.clientName !== undefined && data.clientName !== originalData.clientName);
  if (!canManageOpportunity && changesClient) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  if (!canManageOpportunity && manageContractPeriods) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  if (!canManageOpportunity && data.createdAt !== undefined && data.createdAt !== originalData.createdAt) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  const requesterName = getRequesterName(requester);
  const updateResult = buildOpportunityUpdatePayload(
    data,
    originalData,
    requesterName,
    requester.uid,
    manageContractPeriods,
  );

  const fullOpportunityData = { ...originalData, ...data, id: opportunityId } as Opportunity;
  const shouldCreateCommercialItems = data.stage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado';
  const createdCommercialItems = shouldCreateCommercialItems
    ? await createCommercialItemsFromOpportunity(fullOpportunityData, requester.uid, requesterName)
    : 0;

  await opportunityRef.update(updateResult.updateData);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: updateResult.stageChanged ? 'stage_change' : 'update',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityName: originalData.title,
    details: updateResult.stageChanged
      ? `cambio la etapa de <strong>${originalData.title}</strong> a <strong>${data.stage}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`
      : `actualizo la oportunidad <strong>${originalData.title}</strong> para el cliente <a href="/clients/${originalData.clientId}" class="font-bold text-primary hover:underline">${originalData.clientName}</a>`,
    ownerName: client.ownerName,
  });

  return {
    originalData,
    stageChanged: updateResult.stageChanged,
    isRenewal: updateResult.isRenewal,
    newRenewals: updateResult.newRenewals,
    createdCommercialItems,
    createdInvoices: 0,
  };
}

export async function deleteOpportunityServer(opportunityId: string, requester: ServerUser) {
  const opportunityRef = dbAdmin.collection('opportunities').doc(opportunityId);
  const opportunitySnap = await opportunityRef.get();

  if (!opportunitySnap.exists) {
    throw new OpportunityApiError('Oportunidad no encontrada', 404);
  }

  const opportunity = mapOpportunity(opportunitySnap.id, opportunitySnap.data());
  if (!hasServerManagementPrivileges(requester)) {
    throw new OpportunityApiError('Forbidden', 403);
  }

  const invoicesSnap = await dbAdmin.collection('invoices').where('opportunityId', '==', opportunityId).get();

  const refsToDelete: FirebaseFirestore.DocumentReference[] = [
    ...invoicesSnap.docs.map(invoiceDoc => invoiceDoc.ref),
    opportunityRef,
  ];

  for (let index = 0; index < refsToDelete.length; index += 450) {
    const batch = dbAdmin.batch();
    refsToDelete.slice(index, index + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  const clientSnap = opportunity.clientId
    ? await dbAdmin.collection('clients').doc(opportunity.clientId).get()
    : null;
  const client = clientSnap?.exists ? mapClient(clientSnap.id, clientSnap.data()) : null;
  const requesterName = getRequesterName(requester);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'opportunity',
    entityId: opportunityId,
    entityName: opportunity.title,
    details: `elimino la oportunidad <strong>${opportunity.title}</strong> del cliente ${opportunity.clientName}`,
    ownerName: (client as Client | null)?.ownerName || 'N/A',
  });
}
