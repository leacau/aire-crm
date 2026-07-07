import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

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
