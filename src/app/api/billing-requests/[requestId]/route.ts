import { NextResponse } from 'next/server';
import { billingRequestErrorResponse } from '@/app/api/billing-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { updateBillingRequestStatusServer } from '@/lib/server/billing-requests';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    await updateBillingRequestStatusServer(requestId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return billingRequestErrorResponse(error, {
      action: 'STATUS UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el pedido de facturacion.',
    });
  }
}
