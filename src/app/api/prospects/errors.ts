import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type ProspectErrorContext = RouteErrorContext;

export function prospectErrorResponse(error: unknown, context: ProspectErrorContext) {
  return routeErrorResponse(error, 'PROSPECTS', context, { exposeClientError: true });
}