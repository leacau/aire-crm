import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { getRequesterName, mapClient } from '@/app/api/clients/utils';
import { peopleErrorResponse } from '@/app/api/people/errors';
import type { Person } from '@/lib/types';

type RouteContext = {
  params: Promise<{ personId: string }>;
};

async function getFirstClient(clientIds?: string[]) {
  const clientId = clientIds?.[0];
  if (!clientId) return null;

  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  if (!clientSnap.exists) return null;
  return mapClient(clientSnap.id, clientSnap.data());
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { personId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<Person, 'id'>>;
    const personRef = dbAdmin.collection('people').doc(personId);
    const originalDoc = await personRef.get();

    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const originalData = originalDoc.data() as Person;
    await personRef.update({
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const clientData = await getFirstClient(originalData.clientIds);
    if (clientData) {
      const requesterName = getRequesterName(requester);
      await logServerActivity({
        userId: requester.uid,
        userName: requesterName,
        type: 'update',
        entityType: 'person',
        entityId: personId,
        entityName: data.name || originalData.name,
        details: `actualizo el contacto <strong>${data.name || originalData.name}</strong>`,
        ownerName: clientData.ownerName,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return peopleErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el contacto.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { personId } = await context.params;
    const personRef = dbAdmin.collection('people').doc(personId);
    const personSnap = await personRef.get();

    if (!personSnap.exists) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const personData = personSnap.data() as Person;
    await personRef.delete();

    const clientId = personData.clientIds?.[0];
    const clientData = await getFirstClient(personData.clientIds);
    if (clientData && clientId) {
      const requesterName = getRequesterName(requester);
      await logServerActivity({
        userId: requester.uid,
        userName: requesterName,
        type: 'delete',
        entityType: 'person',
        entityId: personId,
        entityName: personData.name,
        details: `elimino el contacto <strong>${personData.name}</strong> del cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
        ownerName: clientData.ownerName,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return peopleErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el contacto.',
    });
  }
}
