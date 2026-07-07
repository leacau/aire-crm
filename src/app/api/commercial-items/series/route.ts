import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { mapCommercialItem, normalizeCommercialDate, sanitizeCommercialRelations } from '@/app/api/commercial-items/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { CommercialItem } from '@/lib/types';

type SaveSeriesBody = {
  item?: Omit<CommercialItem, 'id' | 'date'>;
  dates?: unknown[];
  isEditingSeries?: boolean;
};

async function getItemsBySeries(seriesId: string): Promise<CommercialItem[]> {
  const snapshot = await dbAdmin
    .collection('commercial_items')
    .where('seriesId', '==', seriesId)
    .get();

  return snapshot.docs
    .map(doc => mapCommercialItem(doc.id, doc.data()))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = (await request.json()) as SaveSeriesBody;
  const item = body?.item;
  const dates = body?.dates || [];

  if (!item?.programId || dates.length === 0) {
    return NextResponse.json({ error: 'Programa y fechas son obligatorios.' }, { status: 400 });
  }

  const newSeriesId = item.seriesId || dbAdmin.collection('commercial_items').doc().id;
  const formattedDates = Array.from(new Set(dates.map(normalizeCommercialDate))).filter(date => date !== 'invalid-date');

  if (formattedDates.length === 0) {
    return NextResponse.json({ error: 'No hay fechas validas para guardar.' }, { status: 400 });
  }

  const batch = dbAdmin.batch();
  const itemToSave = sanitizeCommercialRelations(item as unknown as Record<string, unknown>);

  if (body.isEditingSeries && item.seriesId) {
    const existingItems = await getItemsBySeries(item.seriesId);

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
    entityType: 'commercial_item_series' as any,
    entityId: newSeriesId,
    entityName: item.title || item.description,
    details: `${body.isEditingSeries ? 'actualizo' : 'creo'} ${formattedDates.length} elemento(s) comerciales para <strong>${item.title || item.description}</strong>`,
    ownerName: item.clientName || requesterName,
  });

  return NextResponse.json({ seriesId: newSeriesId });
}
