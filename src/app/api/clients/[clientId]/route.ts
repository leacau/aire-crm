import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerManagement,
  requireServerUser,
} from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { getAccessibleClient } from '@/lib/server/client-access';
import { toTitleCase } from '@/lib/utils';
import { clientErrorResponse } from '@/app/api/clients/errors';
import {
  cleanObject,
  deleteClientGraph,
  FieldValue,
  getRequesterName,
  logClientUpdate,
  mapClient,
} from '@/app/api/clients/utils';
import type { Client } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const client = await getAccessibleClient(clientId, requester);

    return NextResponse.json({ client });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el cliente.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<Client, 'id'>>;
    const docRef = dbAdmin.collection('clients').doc(clientId);
    const originalDoc = await docRef.get();

    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const originalData = mapClient(originalDoc.id, originalDoc.data());
    const canManageClients = hasServerManagementPrivileges(requester);

    if (!canManageClients && originalData.ownerId !== requester.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canManageClients && (data.ownerId !== undefined || data.ownerName !== undefined)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData = cleanObject({
      ...data,
      denominacion: data.denominacion ? toTitleCase(data.denominacion) : data.denominacion,
      razonSocial: data.razonSocial ? toTitleCase(data.razonSocial) : data.razonSocial,
      updatedAt: FieldValue.serverTimestamp(),
      deactivationHistory:
        data.isDeactivated === true && !originalData.isDeactivated
          ? FieldValue.arrayUnion(FieldValue.serverTimestamp())
          : undefined,
    } as Record<string, unknown>);

    await docRef.update(updateData);
    await logClientUpdate(requester, clientId, originalData, data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el cliente.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;

  try {
    const clientData = await deleteClientGraph(clientId);
    const requesterName = getRequesterName(requester);

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'client',
      entityId: clientId,
      entityName: clientData.denominacion,
      details: `elimino el cliente <strong>${clientData.denominacion}</strong> y toda su informacion asociada`,
      ownerName: clientData.ownerName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el cliente.',
      status: 404,
    });
  }
}
