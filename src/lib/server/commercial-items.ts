import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/clients';
import { type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import type { CommercialItem } from '@/lib/types';

export class CommercialItemApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

async function requireCommercialGridEdit(requester: ServerUser) {
  if (!(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
    throw new CommercialItemApiError('Forbidden', 403);
  }
}

export function normalizeCommercialDate(value: unknown): string {
  if (typeof value === 'string') {
    const candidate = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : 'invalid-date';
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return 'invalid-date';
}

export function mapCommercialItem(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): CommercialItem {
  const item = serializeDocument<CommercialItem>(id, data);
  return {
    ...item,
    date: normalizeCommercialDate(data?.date ?? item.date),
  };
}

export function cleanCommercialItemPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

  delete (cleaned as Record<string, unknown>).id;
  delete (cleaned as Record<string, unknown>).date;

  return cleaned;
}

export function sanitizeCommercialRelations<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const cleaned = { ...cleanCommercialItemPayload(payload) } as Record<string, unknown>;

  if (!cleaned.clientId) {
    delete cleaned.clientId;
    delete cleaned.clientName;
  }

  if (!cleaned.opportunityId) {
    delete cleaned.opportunityId;
    delete cleaned.opportunityTitle;
  }

  return cleaned as Partial<T>;
}

export function prepareCommercialItemUpdate(payload: Record<string, unknown>) {
  const cleaned = { ...cleanCommercialItemPayload(payload) } as Record<string, unknown>;

  if (!cleaned.clientId) {
    cleaned.clientId = FieldValue.delete();
    cleaned.clientName = FieldValue.delete();
  }

  if (!cleaned.opportunityId) {
    cleaned.opportunityId = FieldValue.delete();
    cleaned.opportunityTitle = FieldValue.delete();
  }

  if (cleaned.pntReadAt === undefined) {
    cleaned.pntReadAt = FieldValue.delete();
  }

  return cleaned;
}

export async function listCommercialItemsByDateServer(date: string | null) {
  if (!date) {
    throw new CommercialItemApiError('La fecha es obligatoria.', 400);
  }

  const snapshot = await dbAdmin
    .collection('commercial_items')
    .where('date', '==', normalizeCommercialDate(date))
    .get();

  return snapshot.docs.map(doc => mapCommercialItem(doc.id, doc.data()));
}

export async function createCommercialItemServer(rawBody: unknown, requester: ServerUser) {
  await requireCommercialGridEdit(requester);

  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const itemData = body.itemData as Omit<CommercialItem, 'id'> | undefined;

  if (!itemData?.programId || !itemData.date) {
    throw new CommercialItemApiError('Programa y fecha son obligatorios.', 400);
  }

  const dataToSave = {
    ...sanitizeCommercialRelations(itemData as unknown as Record<string, unknown>),
    date: normalizeCommercialDate(itemData.date),
    createdBy: requester.uid,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('commercial_items').add(dataToSave);
  return docRef.id;
}

export async function updateCommercialItemServer(itemId: string, rawBody: unknown, requester: ServerUser) {
  await requireCommercialGridEdit(requester);

  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const itemData = (body.itemData || {}) as Partial<Omit<CommercialItem, 'id'>>;
  const docRef = dbAdmin.collection('commercial_items').doc(itemId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    throw new CommercialItemApiError('Commercial item not found', 404);
  }

  const originalItem = mapCommercialItem(originalSnap.id, originalSnap.data());
  const dataToUpdate = {
    ...prepareCommercialItemUpdate(itemData as Record<string, unknown>),
    updatedBy: requester.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.update(dataToUpdate);

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'commercial_item',
    entityId: itemId,
    entityName: originalItem.title || originalItem.description,
    details: `actualizo el elemento comercial <strong>${originalItem.title || originalItem.description}</strong>`,
    ownerName: originalItem.clientName || requesterName,
  });
}

export async function bulkDeleteCommercialItemsServer(rawBody: unknown, requester: ServerUser) {
  await requireCommercialGridEdit(requester);

  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  if (itemIds.length === 0) return;

  const firstItemRef = dbAdmin.collection('commercial_items').doc(itemIds[0]);
  const firstItemSnap = await firstItemRef.get();
  const firstItem = firstItemSnap.exists ? mapCommercialItem(firstItemSnap.id, firstItemSnap.data()) : null;

  for (let index = 0; index < itemIds.length; index += 450) {
    const batch = dbAdmin.batch();
    itemIds.slice(index, index + 450).forEach(id => {
      batch.delete(dbAdmin.collection('commercial_items').doc(id));
    });
    await batch.commit();
  }

  if (body.logDeletion && firstItem) {
    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'commercial_item',
      entityId: 'multiple',
      entityName: firstItem.title || firstItem.description,
      details: `elimino ${itemIds.length} elemento(s) comercial(es) de la serie <strong>${firstItem.title || firstItem.description}</strong>`,
      ownerName: firstItem.clientName || requesterName,
    });
  }
}

type SaveSeriesBody = {
  item?: Omit<CommercialItem, 'id' | 'date'>;
  dates?: unknown[];
  isEditingSeries?: boolean;
};

export async function listCommercialItemsBySeriesServer(seriesId: string) {
  const snapshot = await dbAdmin
    .collection('commercial_items')
    .where('seriesId', '==', seriesId)
    .get();

  return snapshot.docs
    .map(doc => mapCommercialItem(doc.id, doc.data()))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveCommercialItemSeriesServer(rawBody: unknown, requester: ServerUser) {
  await requireCommercialGridEdit(requester);

  const body = rawBody && typeof rawBody === 'object' ? rawBody as SaveSeriesBody : {};
  const item = body.item;
  const dates = body.dates || [];

  if (!item?.programId || dates.length === 0) {
    throw new CommercialItemApiError('Programa y fechas son obligatorios.', 400);
  }

  const newSeriesId = item.seriesId || dbAdmin.collection('commercial_items').doc().id;
  const formattedDates = Array.from(new Set(dates.map(normalizeCommercialDate))).filter(date => date !== 'invalid-date');

  if (formattedDates.length === 0) {
    throw new CommercialItemApiError('No hay fechas validas para guardar.', 400);
  }

  const batch = dbAdmin.batch();
  const itemToSave = sanitizeCommercialRelations(item as unknown as Record<string, unknown>);

  if (body.isEditingSeries && item.seriesId) {
    const existingItems = await listCommercialItemsBySeriesServer(item.seriesId);

    for (const existingItem of existingItems) {
      if (!formattedDates.includes(existingItem.date)) {
        batch.delete(dbAdmin.collection('commercial_items').doc(existingItem.id));
      }
    }

    for (const date of formattedDates) {
      const existingItem = existingItems.find(candidate => candidate.date === date);
      const docRef = existingItem
        ? dbAdmin.collection('commercial_items').doc(existingItem.id)
        : dbAdmin.collection('commercial_items').doc();

      batch.set(docRef, {
        ...itemToSave,
        seriesId: newSeriesId,
        date,
        updatedBy: requester.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } else {
    for (const date of formattedDates) {
      const docRef = dbAdmin.collection('commercial_items').doc();
      const dataToSave = {
        ...itemToSave,
        date,
        ...(formattedDates.length > 1 ? { seriesId: newSeriesId } : {}),
        createdBy: requester.uid,
        createdAt: FieldValue.serverTimestamp(),
      };

      batch.set(docRef, dataToSave);
    }
  }

  await batch.commit();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: body.isEditingSeries ? 'update' : 'create',
    entityType: 'commercial_item_series',
    entityId: newSeriesId,
    entityName: item.title || item.description,
    details: `${body.isEditingSeries ? 'actualizo' : 'creo'} ${formattedDates.length} elemento(s) comerciales para <strong>${item.title || item.description}</strong>`,
    ownerName: item.clientName || requesterName,
  });

  return newSeriesId;
}
