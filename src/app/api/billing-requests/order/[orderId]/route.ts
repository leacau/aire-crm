import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { BillingRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { orderId } = await context.params;
  if (!orderId) return NextResponse.json({ billingRequests: [] });

  const snapshot = await dbAdmin.collection('billing_requests').where('orderId', '==', orderId).get();
  const billingRequests = snapshot.docs
    .map(doc => serializeDocument<BillingRequest>(doc.id, doc.data()))
    .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());

  return NextResponse.json({ billingRequests });
}
