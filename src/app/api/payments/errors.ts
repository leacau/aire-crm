import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type PaymentErrorContext = RouteErrorContext;

export function paymentErrorResponse(error: unknown, context: PaymentErrorContext) {
  return routeErrorResponse(error, 'PAYMENTS', context, { exposeClientError: true });
}