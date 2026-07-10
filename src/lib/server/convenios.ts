import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import { cleanCanjeCreatePayload } from '@/app/api/canjes/utils';
import { mapAdvertisingOrder } from '@/app/api/advertising-orders/utils';
import type { AdvertisingOrder, Canje, ConvenioCanje, Opportunity } from '@/lib/types';

export class ConvenioApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function newId() {
  return crypto.randomUUID();
}

function mapConvenio(id: string, data: FirebaseFirestore.DocumentData | undefined): ConvenioCanje {
  return serializeDocument<ConvenioCanje>(id, data);
}

function cleanUpdatePayload(payload: Record<string, unknown>) {
  const cleaned = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'id'));

  for (const [key, value] of Object.entries(cleaned)) {
    if (value === undefined) cleaned[key] = FieldValue.delete();
  }

  return cleaned;
}

async function getAdvertisingOrdersByOpportunity(opportunityId: string): Promise<AdvertisingOrder[]> {
  if (!opportunityId) return [];
  const snapshot = await dbAdmin
    .collection('advertising_orders')
    .where('opportunityId', '==', opportunityId)
    .get();
  return snapshot.docs.map(doc => mapAdvertisingOrder(doc.id, doc.data()));
}

async function createCanjeFromConvenio(
  convenio: ConvenioCanje,
  requesterId: string,
  requesterName: string,
): Promise<string> {
  const [opportunitySnap, orders] = await Promise.all([
    convenio.opportunityId
      ? dbAdmin.collection('opportunities').doc(convenio.opportunityId).get()
      : Promise.resolve(null),
    getAdvertisingOrdersByOpportunity(convenio.opportunityId),
  ]);

  const opportunity = opportunitySnap?.exists
    ? serializeDocument<Opportunity>(opportunitySnap.id, opportunitySnap.data())
    : null;
  const value = Number(opportunity?.value || 0);
  const month = (convenio.fechaInicio || convenio.createdAt || new Date().toISOString()).slice(0, 7);
  const billingText = convenio.observaciones || '';
  const modalidad = billingText.includes('AVION') || billingText.includes('AVION')
    ? 'AVION'
    : 'Factura contra factura';

  const canjeData = {
    titulo: opportunity?.title || `Canje ${convenio.clientName}`,
    clienteId: convenio.clientId,
    clienteName: convenio.clientName,
    asesorId: convenio.advisorId,
    asesorName: convenio.advisorName,
    pedido: convenio.clienteEntrega,
    necesidadOrganizacion: convenio.clienteEntrega,
    observaciones: convenio.radioEntrega,
    valorAsociado: value,
    valorCanje: value,
    valorAcordado: value,
    estado: 'En gestiÃ³n',
    tipo: convenio.fechaInicio.slice(0, 7) === convenio.fechaFin.slice(0, 7) ? 'Una vez' : 'Mensual',
    modalidad,
    fechaInicio: convenio.fechaInicio,
    fechaFin: convenio.fechaFin,
    opportunityId: convenio.opportunityId,
    convenioId: convenio.id,
    advertisingOrderIds: orders.map(order => order.id).filter((id): id is string => Boolean(id)),
    migratedFromConvenio: true,
    historialMensual: [{
      mes: month,
      estado: 'En ejecuciÃ³n',
      fechaEstado: new Date().toISOString(),
      valorCanje: value,
      recepciones: [{
        id: newId(),
        descripcion: convenio.clienteEntrega,
        valorTotal: value,
        estado: 'Pendiente',
      }],
      ordenesPublicidad: orders.map(order => ({
        id: newId(),
        orderId: order.id,
        descripcion: order.product || opportunity?.title || 'Orden de publicidad',
        valorTotal: Number(order.totalOrder || value),
      })),
      facturasCliente: [],
      facturasAire: [],
    }],
  } as unknown as Omit<Canje, 'id' | 'fechaCreacion'>;

  const dataToSave = {
    ...cleanCanjeCreatePayload(canjeData as unknown as Record<string, unknown>),
    fechaCreacion: FieldValue.serverTimestamp(),
    creadoPorId: requesterId,
    creadoPorName: requesterName,
  };

  const docRef = await dbAdmin.collection('canjes').add(dataToSave);

  await logServerActivity({
    userId: requesterId,
    userName: requesterName,
    type: 'create',
    entityType: 'canje' as any,
    entityId: docRef.id,
    entityName: canjeData.titulo,
    details: `creo un pedido de canje migrado: <strong>${canjeData.titulo}</strong>`,
    ownerName: convenio.advisorName || requesterName,
  });

  return docRef.id;
}

export async function listConveniosCanjeServer(): Promise<ConvenioCanje[]> {
  const snapshot = await dbAdmin.collection('convenios').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => mapConvenio(doc.id, doc.data()));
}

export async function saveConvenioCanjeServer(
  convenioData: Omit<ConvenioCanje, 'id' | 'createdAt'>,
  userId: string,
  userName: string,
): Promise<string> {
  if (!convenioData?.clientId || !convenioData.clientName) {
    throw new ConvenioApiError('Cliente obligatorio para el convenio.', 400);
  }

  const dataToSave = {
    ...convenioData,
    createdAt: FieldValue.serverTimestamp(),
  };
  const docRef = await dbAdmin.collection('convenios').add(dataToSave);

  await logServerActivity({
    userId,
    userName,
    type: 'create',
    entityType: 'canje' as any,
    entityId: docRef.id,
    entityName: `Convenio: ${convenioData.clientName}`,
    details: `creo un nuevo Convenio de Canje para <strong>${convenioData.clientName}</strong>`,
    ownerName: userName,
  });

  return docRef.id;
}

export async function updateConvenioCanjeServer(
  id: string,
  data: Partial<Omit<ConvenioCanje, 'id' | 'createdAt'>>,
  userId: string,
  userName: string,
): Promise<void> {
  const docRef = dbAdmin.collection('convenios').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new ConvenioApiError('Convenio no encontrado.', 404);

  await docRef.update({
    ...cleanUpdatePayload(data as Record<string, unknown>),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId,
    userName,
    type: 'update',
    entityType: 'canje' as any,
    entityId: id,
    entityName: data.clientName || 'Convenio de Canje',
    details: `actualizo un Convenio de Canje para <strong>${data.clientName || 'Cliente'}</strong>`,
    ownerName: userName,
  });
}

export async function deleteConvenioCanjeServer(
  canjeId: string,
  opportunityId: string | undefined,
  userId: string,
  userName: string,
): Promise<void> {
  const convenioRef = dbAdmin.collection('convenios').doc(canjeId);
  const convenioSnap = await convenioRef.get();
  if (!convenioSnap.exists) throw new ConvenioApiError('Convenio no encontrado.', 404);

  const convenio = mapConvenio(convenioSnap.id, convenioSnap.data());
  const oppId = opportunityId || convenio.opportunityId;
  const batch = dbAdmin.batch();

  batch.delete(convenioRef);

  if (oppId) {
    batch.delete(dbAdmin.collection('opportunities').doc(oppId));

    const [adSnap, invSnap] = await Promise.all([
      dbAdmin.collection('advertising_orders').where('opportunityId', '==', oppId).get(),
      dbAdmin.collection('invoices').where('opportunityId', '==', oppId).get(),
    ]);

    adSnap.forEach(doc => batch.delete(doc.ref));
    invSnap.forEach(doc => batch.delete(doc.ref));
  }

  await batch.commit();

  await logServerActivity({
    userId,
    userName,
    type: 'delete',
    entityType: 'canje' as any,
    entityId: canjeId,
    entityName: 'Convenio de Canje',
    details: 'elimino un Convenio de Canje y su Orden de Publicidad asociada',
    ownerName: userName,
  });
}

export async function migrateLegacyConveniosToCanjesServer(
  userId: string,
  userName: string,
): Promise<{ created: number; skipped: number }> {
  const [conveniosSnap, canjesSnap] = await Promise.all([
    dbAdmin.collection('convenios').get(),
    dbAdmin.collection('canjes').get(),
  ]);

  const convenios = conveniosSnap.docs.map(doc => mapConvenio(doc.id, doc.data()));
  const existingConvenioIds = new Set(
    canjesSnap.docs
      .map(doc => (doc.data() as Canje).convenioId)
      .filter((id): id is string => Boolean(id)),
  );
  let created = 0;
  let skipped = 0;

  for (const convenio of convenios) {
    if (!convenio.id || existingConvenioIds.has(convenio.id) || convenio.masterCanjeId) {
      skipped += 1;
      continue;
    }

    const masterCanjeId = await createCanjeFromConvenio(convenio, userId, userName);
    await dbAdmin.collection('convenios').doc(convenio.id).update({
      masterCanjeId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    existingConvenioIds.add(convenio.id);
    created += 1;
  }

  return { created, skipped };
}
