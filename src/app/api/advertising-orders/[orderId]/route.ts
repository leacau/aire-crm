import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { mapAdvertisingOrder } from '@/app/api/advertising-orders/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

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
