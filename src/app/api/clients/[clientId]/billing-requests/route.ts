import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getAccessibleClient } from '@/lib/server/client-access';
import { serializeDocument } from '@/lib/server/firestore';
import type { BillingRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) return NextResponse.json({ billingRequests: [] });
    const client = await getAccessibleClient(clientId, requester);
    if (!client) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const snapshot = await dbAdmin.collection('billing_requests').where('clientId', '==', clientId).get();
    const billingRequests = snapshot.docs
      .map(doc => serializeDocument<BillingRequest>(doc.id, doc.data()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({ billingRequests });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BILLING REQUESTS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pedidos de facturacion del cliente.',
    });
  }
}
