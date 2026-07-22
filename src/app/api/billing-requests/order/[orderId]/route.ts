import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { canAccessAdvertisingOrder } from '@/lib/server/advertising-order-access';
import { serializeDocument } from '@/lib/server/firestore';
import { getWorkflowAssignmentsServer } from '@/lib/server/workflow-assignments';
import type { AdvertisingOrder, BillingRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    if (!orderId) return NextResponse.json({ billingRequests: [] });

    const [orderSnap, assignments] = await Promise.all([
      dbAdmin.collection('advertising_orders').doc(orderId).get(),
      getWorkflowAssignmentsServer(),
    ]);

    if (!orderSnap.exists) {
      return NextResponse.json({ billingRequests: [] });
    }

    const canUseWorkflowView =
      assignments.approvers.includes(requester.uid) ||
      assignments.billingReceptors.includes(requester.uid) ||
      assignments.tangoInvoicers.includes(requester.uid);
    const order = serializeDocument<AdvertisingOrder>(orderSnap.id, orderSnap.data());

    if (!canUseWorkflowView && !(await canAccessAdvertisingOrder(order, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await dbAdmin.collection('billing_requests').where('orderId', '==', orderId).get();
    const billingRequests = snapshot.docs
      .map(doc => serializeDocument<BillingRequest>(doc.id, doc.data()))
      .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());

    return NextResponse.json({ billingRequests });
  } catch (error: any) {
    console.error('BILLING REQUESTS BY ORDER ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los pedidos de facturacion de la orden.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
