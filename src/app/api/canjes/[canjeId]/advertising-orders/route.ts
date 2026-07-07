import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { AdvertisingOrder } from '@/lib/types';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { canjeId } = await context.params;
  if (!canjeId) return NextResponse.json({ orders: [] });

  const { searchParams } = new URL(request.url);
  const legacyOrderIds = searchParams.getAll('legacyOrderId').filter(Boolean);
  const snapshot = await dbAdmin.collection('advertising_orders').where('canjeId', '==', canjeId).get();
  const orders = snapshot.docs.map(doc => serializeDocument<AdvertisingOrder>(doc.id, doc.data()));
  const foundIds = new Set(orders.map(order => order.id));
  const missingLegacyIds = legacyOrderIds.filter(orderId => !foundIds.has(orderId));

  const legacySnapshots = await Promise.all(
    missingLegacyIds.map(orderId => dbAdmin.collection('advertising_orders').doc(orderId).get()),
  );

  legacySnapshots.forEach(orderSnapshot => {
    if (orderSnapshot.exists) {
      orders.push(serializeDocument<AdvertisingOrder>(orderSnapshot.id, orderSnapshot.data()));
    }
  });

  orders.sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''));

  return NextResponse.json({ orders });
}
