import { NextResponse } from 'next/server';
import { billingRequestErrorResponse } from '@/app/api/billing-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listBillingRequestsByOrderServer } from '@/lib/server/billing-requests';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    return NextResponse.json({ billingRequests: await listBillingRequestsByOrderServer(orderId, requester) });
  } catch (error) {
    return billingRequestErrorResponse(error, {
      action: 'BY ORDER LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pedidos de facturacion de la orden.',
    });
  }
}
