import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type OrderLinkErrorContext = RouteErrorContext;

export function orderLinkErrorResponse(error: unknown, context: OrderLinkErrorContext) {
  return routeErrorResponse(error, 'ORDER LINKS', context);
}