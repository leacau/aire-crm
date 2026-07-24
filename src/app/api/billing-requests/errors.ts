import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type BillingRequestErrorContext = RouteErrorContext;

export function billingRequestErrorResponse(error: unknown, context: BillingRequestErrorContext) {
  return routeErrorResponse(error, 'BILLING REQUESTS', context, { exposeClientError: true });
}