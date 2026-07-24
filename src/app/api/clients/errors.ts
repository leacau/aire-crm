import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type ClientErrorContext = RouteErrorContext;

export function clientErrorResponse(error: unknown, context: ClientErrorContext) {
  return routeErrorResponse(error, 'CLIENTS', context, { exposeClientError: true });
}