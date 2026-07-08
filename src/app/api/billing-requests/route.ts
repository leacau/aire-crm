import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { AdvertisingOrder, BillingRequest, Client } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const [requestsSnap, ordersSnap, clientsSnap] = await Promise.all([
    dbAdmin.collection('billing_requests').get(),
    dbAdmin.collection('advertising_orders').get(),
    dbAdmin.collection('clients').get(),
  ]);

  const ordersMap = new Map(
    ordersSnap.docs.map(doc => [doc.id, serializeDocument<AdvertisingOrder>(doc.id, doc.data())]),
  );
  const clientsMap = new Map(
    clientsSnap.docs.map(doc => [doc.id, serializeDocument<Client>(doc.id, doc.data())]),
  );

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
    .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());

  return NextResponse.json({ requests });
}
