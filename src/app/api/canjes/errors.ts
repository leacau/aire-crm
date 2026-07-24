import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type CanjeErrorContext = RouteErrorContext;

export function canjeErrorResponse(error: unknown, context: CanjeErrorContext) {
  return routeErrorResponse(error, 'CANJES', context, { exposeClientError: true });
}