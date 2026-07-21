import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
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

  try {
    const snapshot = await dbAdmin.collection('clients').orderBy('denominacion').get();
    const clients = snapshot.docs.map(doc => mapClient(doc.id, doc.data()));

    return NextResponse.json({ clients });
  } catch (error: any) {
    console.error('CLIENTS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los clientes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const clientData = body?.clientData || {};
    const requesterName = getRequesterName(requester);
    const canAssignOwner = hasServerManagementPrivileges(requester);
    const ownerId = canAssignOwner && body?.ownerId ? String(body.ownerId) : requester.uid;
    const ownerName = canAssignOwner && body?.ownerName ? String(body.ownerName) : requesterName;

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
  } catch (error: any) {
    console.error('CLIENT CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear el cliente.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
