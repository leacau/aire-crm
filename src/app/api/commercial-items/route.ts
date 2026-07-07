import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { mapCommercialItem, normalizeCommercialDate, sanitizeCommercialRelations } from '@/app/api/commercial-items/utils';
import type { CommercialItem } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'La fecha es obligatoria.' }, { status: 400 });
  }

  const snapshot = await dbAdmin
    .collection('commercial_items')
    .where('date', '==', normalizeCommercialDate(date))
    .get();

  const items = snapshot.docs.map(doc => mapCommercialItem(doc.id, doc.data()));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const itemData = body?.itemData as Omit<CommercialItem, 'id'> | undefined;

  if (!itemData?.programId || !itemData.date) {
    return NextResponse.json({ error: 'Programa y fecha son obligatorios.' }, { status: 400 });
  }

  const dataToSave = {
    ...sanitizeCommercialRelations(itemData as unknown as Record<string, unknown>),
    date: normalizeCommercialDate(itemData.date),
    createdBy: requester.uid,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('commercial_items').add(dataToSave);

  return NextResponse.json({ id: docRef.id });
}
