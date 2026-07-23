import { NextResponse } from 'next/server';
import { paymentErrorResponse } from '@/app/api/payments/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { requestPaymentExplanationServer } from '@/lib/server/payments';

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { paymentId } = await context.params;
    const body = await request.json();
    await requestPaymentExplanationServer(paymentId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'EXPLANATION REQUEST',
      requesterId: requester.uid,
      publicError: 'No se pudo solicitar la aclaracion del pago.',
    });
  }
}
