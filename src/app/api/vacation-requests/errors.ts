import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { VacationRequestApiError } from '@/lib/server/vacation-requests';

type VacationRequestErrorContext = RouteErrorContext;

export function vacationRequestErrorResponse(error: unknown, context: VacationRequestErrorContext) {
  if (error instanceof VacationRequestApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'VACATION REQUEST', context);
}