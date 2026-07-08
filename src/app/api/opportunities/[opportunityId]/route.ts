import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { parseISO } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { cleanObject, getRequesterName, mapClient } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import {
  buildInvoiceCreatePayload,
  buildMonthlyBillingIncrement,
  normalizeInvoiceAmount,
} from '@/app/api/invoices/utils';
import type { Client, CommercialItem, Invoice, Opportunity, OpportunityPeriod, Program } from '@/lib/types';

type RouteContext = {
  params: Promise<{ opportunityId: string }>;
};

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
    throw new Error('La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.');
  }
  if (!!nextStartDate !== !!nextEndDate) {
    throw new Error('La fecha de inicio y fin de la vigencia deben cargarse juntas.');
  }
  if (nextStartDate && nextEndDate && parseISO(nextEndDate) < parseISO(nextStartDate)) {
    throw new Error('La fecha de fin del contrato no puede ser anterior a la fecha de inicio.');
  }
  if (
    !manageContractPeriods
    && originalData.startDate
    && originalData.endDate
    && ((typeof data.startDate === 'string' && data.startDate !== originalData.startDate)
      || (typeof data.endDate === 'string' && data.endDate !== originalData.endDate))
  ) {
    throw new Error('La vigencia inicial ya fue confirmada. Para extenderla, usa Renovar periodo.');
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
      throw new Error('La renovacion contiene una vigencia invalida.');
    }
    const overlaps = occupiedPeriods.some(existing => (
      period.startDate <= existing.endDate && period.endDate >= existing.startDate
    ));
    if (overlaps) throw new Error('La renovacion se superpone con una vigencia ya registrada.');
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
  if (bonusStateChanged && (originalData.stage as string) === 'NegociaciÃ³n a Aprobar') {
    updateData.stage = 'NegociaciÃ³n';
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

async function createPendingInvoices(
  invoices: Omit<Invoice, 'id' | 'opportunityId'>[] | undefined,
  opportunityId: string,
  requesterId: string,
) {
  if (!invoices || invoices.length === 0) return 0;

  let created = 0;
  for (const invoiceData of invoices) {
    const invoiceToSave = {
      ...invoiceData,
      opportunityId,
    } as Omit<Invoice, 'id'>;
    await dbAdmin.collection('invoices').add(buildInvoiceCreatePayload(invoiceToSave));
    created += 1;

    if (invoiceToSave.date && !invoiceToSave.isCreditNote) {
      const monthKey = invoiceToSave.date.substring(0, 7);
      const amountToLog = Math.abs(normalizeInvoiceAmount(invoiceToSave.amount));
      const increment = buildMonthlyBillingIncrement(monthKey, amountToLog, requesterId);
      await dbAdmin.collection('estadisticas_mensuales').doc(increment.monthKey).set(increment.data, { merge: true });
    }
  }

  return created;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { opportunityId } = await context.params;
  const body = await request.json();
  const data = (body?.data || {}) as Partial<Omit<Opportunity, 'id'>>;
  const pendingInvoices = body?.pendingInvoices as Omit<Invoice, 'id' | 'opportunityId'>[] | undefined;
  const manageContractPeriods = Boolean(body?.options?.manageContractPeriods);

  const opportunityRef = dbAdmin.collection('opportunities').doc(opportunityId);
  const opportunitySnap = await opportunityRef.get();
  if (!opportunitySnap.exists) {
    return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 });
  }

  const originalData = serializeDocument<Opportunity>(opportunitySnap.id, opportunitySnap.data());
  const clientSnap = await dbAdmin.collection('clients').doc(originalData.clientId).get();
  if (!clientSnap.exists) {
    return NextResponse.json({ error: 'Cliente no encontrado para actualizar la oportunidad.' }, { status: 404 });
  }

  const client = mapClient(clientSnap.id, clientSnap.data());
  const requesterName = getRequesterName(requester);
  let updateResult: ReturnType<typeof buildOpportunityUpdatePayload>;
  try {
    updateResult = buildOpportunityUpdatePayload(data, originalData, requesterName, requester.uid, manageContractPeriods);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo actualizar la oportunidad.' }, { status: 400 });
  }

  const fullOpportunityData = { ...originalData, ...data, id: opportunityId } as Opportunity;
  const shouldCreateCommercialItems = data.stage === 'Cerrado - Ganado' && originalData.stage !== 'Cerrado - Ganado';
  const createdCommercialItems = shouldCreateCommercialItems
    ? await createCommercialItemsFromOpportunity(fullOpportunityData, requester.uid, requesterName)
    : 0;

  await opportunityRef.update(updateResult.updateData);
  const createdInvoices = await createPendingInvoices(pendingInvoices, opportunityId, requester.uid);

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

  return NextResponse.json({
    ok: true,
    originalData,
    stageChanged: updateResult.stageChanged,
    isRenewal: updateResult.isRenewal,
    newRenewals: updateResult.newRenewals,
    createdCommercialItems,
    createdInvoices,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { opportunityId } = await context.params;
  const opportunityRef = dbAdmin.collection('opportunities').doc(opportunityId);
  const opportunitySnap = await opportunityRef.get();

  if (!opportunitySnap.exists) {
    return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 });
  }

  const opportunity = serializeDocument<Opportunity>(opportunitySnap.id, opportunitySnap.data());
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

  return NextResponse.json({ ok: true });
}
