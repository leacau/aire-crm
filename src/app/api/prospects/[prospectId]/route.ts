import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Prospect } from '@/lib/types';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

function cleanProspectUpdatePayload(payload: Partial<Prospect>) {
  const updateData = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'creatorId'
      && key !== 'creatorName'
      && value !== undefined
    )),
  ) as Record<string, unknown>;

  updateData.updatedAt = FieldValue.serverTimestamp();
  return updateData;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    const body = await request.json();
    const data = body?.data as Partial<Omit<Prospect, 'id'>> | undefined;

    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('prospects').doc(prospectId);
    const prospectSnap = await docRef.get();
    if (!prospectSnap.exists) {
      return NextResponse.json({ error: 'Prospecto no encontrado.' }, { status: 404 });
    }

    const originalData = serializeDocument<Prospect>(prospectSnap.id, prospectSnap.data());
    if (requester.uid !== originalData.ownerId && !hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData = cleanProspectUpdatePayload(data);
    if (!hasServerManagementPrivileges(requester)) {
      delete updateData.ownerId;
      delete updateData.ownerName;
      delete updateData.previousOwnerId;
      delete updateData.unassignedAt;
      delete updateData.claimStatus;
      delete updateData.claimantId;
      delete updateData.claimantName;
      delete updateData.claimedAt;
    }

    await docRef.update(updateData);

    const requesterName = getRequesterName(requester);
    let details = `actualizo el prospecto <strong>${originalData.companyName}</strong>`;
    if (data.status && data.status !== originalData.status) {
      details = `cambio el estado del prospecto <strong>${originalData.companyName}</strong> a <strong>${data.status}</strong>`;
    }

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'prospect',
      entityId: prospectId,
      entityName: originalData.companyName,
      details,
      ownerName: originalData.ownerName,
    });

    return NextResponse.json({ ok: true, originalData });
  } catch (error: any) {
    console.error('PROSPECT UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar el prospecto.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    const docRef = dbAdmin.collection('prospects').doc(prospectId);
    const prospectSnap = await docRef.get();
    if (!prospectSnap.exists) {
      return NextResponse.json({ error: 'Prospecto no encontrado.' }, { status: 404 });
    }

    const prospect = serializeDocument<Prospect>(prospectSnap.id, prospectSnap.data());
    if (requester.uid !== prospect.ownerId && !hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.delete();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'prospect',
      entityId: prospectId,
      entityName: prospect.companyName,
      details: `elimino el prospecto <strong>${prospect.companyName}</strong>`,
      ownerName: prospect.ownerName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('PROSPECT DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo eliminar el prospecto.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
