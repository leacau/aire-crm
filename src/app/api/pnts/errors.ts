import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { ScheduledPntApiError } from '@/lib/server/scheduled-pnts';

type PntErrorContext = RouteErrorContext;

export function pntErrorResponse(error: unknown, context: PntErrorContext) {
  if (error instanceof ScheduledPntApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'PNTS', context);
}