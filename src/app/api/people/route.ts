import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { getRequesterName, mapClient } from '@/app/api/clients/utils';
import type { Person } from '@/lib/types';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const personData = body?.personData as Omit<Person, 'id'> | undefined;

  if (!personData?.name?.trim()) {
    return NextResponse.json({ error: 'El nombre del contacto es obligatorio.' }, { status: 400 });
  }

  const docRef = await dbAdmin.collection('people').add({
    ...personData,
    createdAt: FieldValue.serverTimestamp(),
  });

  const requesterName = getRequesterName(requester);
  for (const clientId of personData.clientIds || []) {
    const clientRef = dbAdmin.collection('clients').doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) continue;

    const clientData = mapClient(clientSnap.id, clientSnap.data());
    await clientRef.update({ personIds: FieldValue.arrayUnion(docRef.id) });
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'person',
      entityId: docRef.id,
      entityName: personData.name,
      details: `creo el contacto <strong>${personData.name}</strong> para el cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
      ownerName: clientData.ownerName,
    });
  }

  return NextResponse.json({ id: docRef.id });
}

