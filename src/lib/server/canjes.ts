import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/requester';
import { type ServerUser } from '@/lib/server/auth';
import { filterAccessibleAdvertisingOrders } from '@/lib/server/advertising-order-access';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import { mapInvoice } from '@/lib/server/invoices';
import type { AdvertisingOrder, Canje, HistorialMensualItem } from '@/lib/types';

export class CanjeApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function cleanCanjeCreatePayload(payload: Record<string, unknown>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => key !== 'id' && value !== undefined),
  );
  delete cleaned.fechaCreacion;
  return cleaned;
}

export function normalizeDateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  return undefined;
}

export function normalizeCanjeHistoryItem(item: HistorialMensualItem): HistorialMensualItem {
  return {
    ...item,
    fechaEstado: normalizeDateOnly(item.fechaEstado) || item.fechaEstado,
    fechaCulminacion: normalizeDateOnly(item.fechaCulminacion),
  };
}

export function mapCanje(id: string, data: FirebaseFirestore.DocumentData | undefined): Canje {
  const canje = serializeDocument<Canje>(id, data);
  return {
    ...canje,
    fechaResolucion: normalizeDateOnly(canje.fechaResolucion),
    fechaCulminacion: normalizeDateOnly(canje.fechaCulminacion),
    historialMensual: canje.historialMensual
      ?.map(normalizeCanjeHistoryItem)
      .sort((a, b) => b.mes.localeCompare(a.mes)),
  };
}

export function cleanCanjeUpdatePayload(payload: Record<string, unknown>, deleteKeys: string[] = []) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'id'),
  );

  deleteKeys.forEach(key => {
    if (key !== 'id') {
      cleaned[key] = FieldValue.delete();
    }
  });

  for (const [key, value] of Object.entries(cleaned)) {
    if (value === undefined) {
      cleaned[key] = FieldValue.delete();
    }
  }

  if (Array.isArray(cleaned.historialMensual)) {
    cleaned.historialMensual = cleaned.historialMensual.map((item: HistorialMensualItem) => ({
      ...item,
      fechaEstado: item.fechaEstado ? new Date(item.fechaEstado).toISOString() : item.fechaEstado,
      fechaCulminacion: item.fechaCulminacion ? new Date(item.fechaCulminacion).toISOString() : item.fechaCulminacion,
    }));
  }

  return cleaned;
}

export async function listCanjesServer() {
  const snapshot = await dbAdmin.collection('canjes').orderBy('fechaCreacion', 'desc').get();
  return snapshot.docs.map(doc => mapCanje(doc.id, doc.data()));
}

export async function createCanjeServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const canjeData = body.canjeData as Omit<Canje, 'id' | 'fechaCreacion'> | undefined;

  if (!canjeData?.titulo) {
    throw new CanjeApiError('El titulo del canje es obligatorio.', 400);
  }

  const requesterName = getRequesterName(requester);
  const dataToSave = {
    ...cleanCanjeCreatePayload(canjeData as unknown as Record<string, unknown>),
    fechaCreacion: FieldValue.serverTimestamp(),
    creadoPorId: requester.uid,
    creadoPorName: requesterName,
  };

  const docRef = await dbAdmin.collection('canjes').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'canje',
    entityId: docRef.id,
    entityName: canjeData.titulo,
    details: `creo un pedido de canje: <strong>${canjeData.titulo}</strong>`,
    ownerName: canjeData.asesorName || requesterName,
  });

  return docRef.id;
}

export async function updateCanjeServer(canjeId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const data = (body.data || {}) as Partial<Omit<Canje, 'id'>>;
  const deleteKeys = Array.isArray(body.deleteKeys)
    ? body.deleteKeys.filter((key: unknown): key is string => typeof key === 'string')
    : [];
  const docRef = dbAdmin.collection('canjes').doc(canjeId);
  const originalDoc = await docRef.get();

  if (!originalDoc.exists) {
    throw new CanjeApiError('Canje not found', 404);
  }

  const originalData = mapCanje(originalDoc.id, originalDoc.data());
  const requesterName = getRequesterName(requester);
  const updateData = cleanCanjeUpdatePayload(data as Record<string, unknown>, deleteKeys);

  if (data.tipo === 'Una vez' && data.estado === 'Aprobado' && originalData.estado !== 'Aprobado') {
    updateData.culminadoPorId = requester.uid;
    updateData.culminadoPorName = requesterName;
  }

  await docRef.update(updateData);

  let details = `actualizo el canje <strong>${originalData.titulo}</strong>`;
  if (data.estado && data.estado !== originalData.estado) {
    details = `cambio el estado del canje <strong>${originalData.titulo}</strong> a <strong>${data.estado}</strong>`;
  }
  if (data.clienteId && data.clienteId !== originalData.clienteId) {
    details = `asigno el canje <strong>${originalData.titulo}</strong> al cliente <strong>${data.clienteName}</strong>`;
  }
  if (data.historialMensual) {
    details = `actualizo el historial mensual del canje <strong>${originalData.titulo}</strong>`;
  }

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'canje',
    entityId: canjeId,
    entityName: originalData.titulo,
    details,
    ownerName: data.asesorName || originalData.asesorName,
  });
}

export async function deleteCanjeServer(canjeId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('canjes').doc(canjeId);
  const canjeSnap = await docRef.get();

  if (!canjeSnap.exists) {
    throw new CanjeApiError('Canje not found', 404);
  }

  const canjeData = mapCanje(canjeSnap.id, canjeSnap.data());
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'canje',
    entityId: canjeId,
    entityName: canjeData.titulo,
    details: `elimino el canje <strong>${canjeData.titulo}</strong>`,
    ownerName: canjeData.asesorName || requesterName,
  });
}

export async function listCanjeAdvertisingOrdersServer(
  canjeId: string,
  legacyOrderIds: string[],
  requester: ServerUser,
) {
  if (!canjeId) return [];

  const uniqueLegacyIds = Array.from(new Set(legacyOrderIds.filter(Boolean)));
  const snapshot = await dbAdmin.collection('advertising_orders').where('canjeId', '==', canjeId).get();
  const orders = snapshot.docs.map(doc => serializeDocument<AdvertisingOrder>(doc.id, doc.data()));
  const foundIds = new Set(orders.map(order => order.id));
  const missingLegacyIds = uniqueLegacyIds.filter(orderId => !foundIds.has(orderId));

  const legacySnapshots = await Promise.all(
    missingLegacyIds.map(orderId => dbAdmin.collection('advertising_orders').doc(orderId).get()),
  );

  legacySnapshots.forEach(orderSnapshot => {
    if (orderSnapshot.exists) {
      orders.push(serializeDocument<AdvertisingOrder>(orderSnapshot.id, orderSnapshot.data()));
    }
  });

  const accessibleOrders = await filterAccessibleAdvertisingOrders(orders, requester);
  return accessibleOrders.sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''));
}

export async function listCanjeInvoicesServer(canjeId: string) {
  if (!canjeId) return [];

  const snapshot = await dbAdmin.collection('invoices').where('canjeId', '==', canjeId).get();
  return snapshot.docs
    .map(doc => mapInvoice(doc.id, doc.data()))
    .sort((a, b) => (b.date || b.dateGenerated || '').localeCompare(a.date || a.dateGenerated || ''));
}
