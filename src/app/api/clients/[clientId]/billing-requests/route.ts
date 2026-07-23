import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listClientBillingRequestsServer } from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) return NextResponse.json({ billingRequests: [] });
    return NextResponse.json({ billingRequests: await listClientBillingRequestsServer(clientId, requester) });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BILLING REQUESTS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pedidos de facturacion del cliente.',
    });
  }
}
