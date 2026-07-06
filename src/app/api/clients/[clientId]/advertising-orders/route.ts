import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { AdvertisingOrder } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;
  if (!clientId) return NextResponse.json({ orders: [] });

  const snapshot = await dbAdmin.collection('advertising_orders').where('clientId', '==', clientId).get();
  const orders = snapshot.docs
    .map(doc => serializeDocument<AdvertisingOrder>(doc.id, doc.data()))
    .sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''));

  return NextResponse.json({ orders });
}
