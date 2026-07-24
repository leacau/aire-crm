import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type ActivityErrorContext = RouteErrorContext;

export function activityErrorResponse(error: unknown, context: ActivityErrorContext) {
  return routeErrorResponse(error, 'ACTIVITIES', context, { exposeClientError: true });
}