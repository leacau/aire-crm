import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import {
  cleanObject,
  deleteClientGraph,
  FieldValue,
  getRequesterName,
} from '@/app/api/clients/utils';
import { clientErrorResponse } from '@/app/api/clients/errors';
import type { Client } from '@/lib/types';

export async function DELETE(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const clientIds = Array.isArray(body?.clientIds) ? body.clientIds.map(String).filter(Boolean) : [];

    for (const clientId of clientIds) {
      await deleteClientGraph(clientId);
    }

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'client',
      entityId: 'multiple',
      entityName: 'multiple',
      details: `elimino <strong>${clientIds.length}</strong> clientes de forma masiva`,
      ownerName: requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BULK DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudieron eliminar los clientes.',
    });
  }
}

export async function PATCH(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const updates = Array.isArray(body?.updates)
      ? body.updates as { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[]
      : [];

    for (let index = 0; index < updates.length; index += 450) {
      const batch = dbAdmin.batch();
      updates.slice(index, index + 450).forEach(({ id, data }) => {
        const docRef = dbAdmin.collection('clients').doc(id);
        batch.update(docRef, cleanObject({ ...data, updatedAt: FieldValue.serverTimestamp() } as Record<string, unknown>));
      });
      await batch.commit();
    }

    const isReassign = updates.length > 0 && updates[0].data.ownerName;
    if (isReassign) {
      const requesterName = getRequesterName(requester);
      const newOwnerName = updates[0].data.ownerName;
      await logServerActivity({
        userId: requester.uid,
        userName: requesterName,
        type: 'update',
        entityType: 'client',
        entityId: 'multiple',
        entityName: 'multiple',
        details: `reasigno <strong>${updates.length}</strong> clientes a <strong>${newOwnerName}</strong>`,
        ownerName: newOwnerName,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BULK UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudieron actualizar los clientes.',
    });
  }
}
