import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { buildSocialMediaUpdatePayload, mapSocialMediaRequest } from '@/app/api/social-media-requests/utils';
import type { SocialMediaRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const snap = await dbAdmin.collection('social_media_requests').doc(requestId).get();

  return NextResponse.json({
    request: snap.exists ? mapSocialMediaRequest(snap.id, snap.data()) : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const body = await request.json();
  const data = (body?.data || {}) as Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>;
  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const originalData = mapSocialMediaRequest(snap.id, snap.data());
  const updateData = buildSocialMediaUpdatePayload(data as Record<string, unknown>);

  if (Array.isArray(data.approvalHistory)) {
    delete updateData.approvalHistory;
    if (data.approvalHistory.length > 0) {
      updateData.approvalHistory = FieldValue.arrayUnion(...data.approvalHistory);
    }
  }

  await docRef.update(updateData);

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request' as any,
    entityId: requestId,
    entityName: data.clientName || originalData.clientName,
    details: `actualizo un pedido de redes de <strong>${data.clientName || originalData.clientName}</strong>`,
    ownerName: data.advisorName || originalData.advisorName,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ ok: true });
  }

  const data = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'social_media_request' as any,
    entityId: requestId,
    entityName: data.clientName || 'Pedido de redes',
    details: `elimino un pedido de redes de <strong>${data.clientName || 'Cliente'}</strong>`,
    ownerName: data.advisorName || requesterName,
  });

  return NextResponse.json({ ok: true });
}
