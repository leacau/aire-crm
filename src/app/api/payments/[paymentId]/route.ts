import { NextResponse } from 'next/server';
import { paymentErrorResponse } from '@/app/api/payments/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { updatePaymentServer } from '@/lib/server/payments';

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { paymentId } = await context.params;
    const body = await request.json();
    await updatePaymentServer(paymentId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el pago.',
    });
  }
}
