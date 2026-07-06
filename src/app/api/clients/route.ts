import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { toTitleCase } from '@/lib/utils';
import {
  cleanObject,
  FieldValue,
  getRequesterName,
  mapClient,
} from '@/app/api/clients/utils';
import type { Client } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snapshot = await dbAdmin.collection('clients').orderBy('denominacion').get();
  const clients = snapshot.docs.map(doc => mapClient(doc.id, doc.data()));

  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const clientData = body?.clientData || {};
  const requesterName = getRequesterName(requester);
  const ownerId = body?.ownerId || requester.uid;
  const ownerName = body?.ownerName || requesterName;

  const denominacion = toTitleCase(String(clientData.denominacion || '').trim());
  if (!denominacion) {
    return NextResponse.json({ error: 'La denominacion es obligatoria.' }, { status: 400 });
  }

  const newClientData = cleanObject({
    ...clientData,
    denominacion,
    razonSocial: clientData.razonSocial ? toTitleCase(clientData.razonSocial) : '',
    personIds: [],
    ownerId,
    ownerName,
    createdAt: FieldValue.serverTimestamp(),
    isDeactivated: false,
    deactivationHistory: [],
    newClientDate: clientData.isNewClient ? FieldValue.serverTimestamp() : undefined,
    isNewClient: Boolean(clientData.isNewClient),
  } as Record<string, unknown>);

  const docRef = await dbAdmin.collection('clients').add(newClientData);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'client',
    entityId: docRef.id,
    entityName: denominacion,
    details: `creo el cliente <a href="/clients/${docRef.id}" class="font-bold text-primary hover:underline">${denominacion}</a>`,
    ownerName,
  });

  return NextResponse.json({ id: docRef.id });
}

