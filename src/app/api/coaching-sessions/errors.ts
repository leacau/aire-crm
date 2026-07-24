import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { CoachingApiError } from '@/lib/server/coaching';

type CoachingErrorContext = RouteErrorContext;

export function coachingErrorResponse(error: unknown, context: CoachingErrorContext) {
  if (error instanceof CoachingApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'COACHING', context);
}