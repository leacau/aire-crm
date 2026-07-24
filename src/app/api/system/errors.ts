import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type SystemErrorContext = RouteErrorContext;

export function systemErrorResponse(error: unknown, context: SystemErrorContext) {
  return routeErrorResponse(error, 'SYSTEM', context);
}