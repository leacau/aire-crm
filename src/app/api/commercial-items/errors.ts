import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type CommercialItemErrorContext = RouteErrorContext;

export function commercialItemErrorResponse(error: unknown, context: CommercialItemErrorContext) {
  return routeErrorResponse(error, 'COMMERCIAL ITEMS', context, { exposeClientError: true });
}