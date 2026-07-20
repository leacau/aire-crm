import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { canAccessAdvisorScopedRecord } from '@/lib/server/advisor-scoped-access';
import { mapSocialMediaRequest } from '@/app/api/social-media-requests/utils';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const body = await request.json();
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const orderTitle = typeof body?.orderTitle === 'string' ? body.orderTitle.trim() : '';

  if (!orderId || !orderTitle) {
    return NextResponse.json({ error: 'Orden obligatoria para vincular el pedido.' }, { status: 400 });
  }

  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const socialRequest = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(socialRequest, requester))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await docRef.update({
    orderId,
    orderTitle,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request' as any,
    entityId: requestId,
    entityName: 'Pedido de Redes',
    details: `vinculo un pedido de redes a la orden <strong>${orderTitle}</strong>`,
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  if (!reason) {
    return NextResponse.json({ error: 'Debe indicar el motivo de la desvinculacion.' }, { status: 400 });
  }

  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const socialRequest = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(socialRequest, requester))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requesterName = getRequesterName(requester);
  await docRef.update({
    orderId: FieldValue.delete(),
    orderTitle: FieldValue.delete(),
    orderUnlinkedAt: FieldValue.serverTimestamp(),
    orderUnlinkedById: requester.uid,
    orderUnlinkedByName: requesterName,
    orderUnlinkReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request' as any,
    entityId: requestId,
    entityName: 'Pedido de Redes',
    details: 'quito la vinculacion de un pedido de redes con una orden de publicidad',
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}
