import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { mapAdvertisingOrder } from '@/app/api/advertising-orders/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { orderId } = await context.params;
  const snap = await dbAdmin.collection('advertising_orders').doc(orderId).get();

  return NextResponse.json({
    order: snap.exists ? mapAdvertisingOrder(snap.id, snap.data()) : null,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { orderId } = await context.params;
  const docRef = dbAdmin.collection('advertising_orders').doc(orderId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
  }

  const order = mapAdvertisingOrder(snap.id, snap.data());
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'opportunity' as any,
    entityId: orderId,
    entityName: 'Orden de Publicidad',
    details: `elimino una orden de publicidad del cliente <strong>${order.clientName || 'Cliente'}</strong>`,
    ownerName: 'Sistema',
  });

  return NextResponse.json({ ok: true });
}
