import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { getWorkflowAssignmentsServer } from '@/lib/server/workflow-assignments';
import type { AdvertisingOrder, BillingRequest, Client } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const [requestsSnap, ordersSnap, clientsSnap, assignments] = await Promise.all([
      dbAdmin.collection('billing_requests').get(),
      dbAdmin.collection('advertising_orders').get(),
      dbAdmin.collection('clients').get(),
      getWorkflowAssignmentsServer(),
    ]);

    const ordersMap = new Map(
      ordersSnap.docs.map(doc => [doc.id, serializeDocument<AdvertisingOrder>(doc.id, doc.data())]),
    );
    const clientsMap = new Map(
      clientsSnap.docs.map(doc => [doc.id, serializeDocument<Client>(doc.id, doc.data())]),
    );

    const canSeeAll = hasServerManagementPrivileges(requester) || assignments.billingReceptors.includes(requester.uid);
    const requests = requestsSnap.docs
      .map(doc => {
        const billing = serializeDocument<BillingRequest>(doc.id, doc.data());
        const order = billing.orderId ? ordersMap.get(billing.orderId) : undefined;
        const client = billing.clientId ? clientsMap.get(billing.clientId) : undefined;

        return {
          ...billing,
          accountExecutive: order?.accountExecutive || 'Sistema',
          advisorId: order?.createdBy || '',
          opportunityTitle: order?.opportunityTitle || order?.product || 'Campana',
          clientDisplayName:
            client?.razonSocialTango || client?.razonSocial || client?.denominacion || 'Desconocido',
          cuit: client?.cuit || '-',
          billingStatus: (billing as any).billingStatus || 'Sugerido',
          invoiceNumber: (billing as any).invoiceNumber || '',
        };
      })
      .filter(request => canSeeAll || request.advisorId === requester.uid)
      .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error('BILLING REQUESTS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los pedidos de facturacion.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
