import { NextResponse } from 'next/server';
import { billingRequestErrorResponse } from '@/app/api/billing-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listBillingRequestsServer } from '@/lib/server/billing-requests';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ requests: await listBillingRequestsServer(requester) });
  } catch (error) {
    return billingRequestErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pedidos de facturacion.',
    });
  }
}
