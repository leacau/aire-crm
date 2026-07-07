import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { cleanCanjeCreatePayload, mapCanje } from '@/app/api/canjes/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { Canje } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snapshot = await dbAdmin.collection('canjes').orderBy('fechaCreacion', 'desc').get();
  const canjes = snapshot.docs.map(doc => mapCanje(doc.id, doc.data()));

  return NextResponse.json({ canjes });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const canjeData = body?.canjeData as Omit<Canje, 'id' | 'fechaCreacion'> | undefined;

  if (!canjeData?.titulo) {
    return NextResponse.json({ error: 'El titulo del canje es obligatorio.' }, { status: 400 });
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
    entityType: 'canje' as any,
    entityId: docRef.id,
    entityName: canjeData.titulo,
    details: `creo un pedido de canje: <strong>${canjeData.titulo}</strong>`,
    ownerName: canjeData.asesorName || requesterName,
  });

  return NextResponse.json({ id: docRef.id });
}
