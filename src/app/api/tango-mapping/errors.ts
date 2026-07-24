import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type TangoMappingErrorContext = RouteErrorContext;

export function tangoMappingErrorResponse(error: unknown, context: TangoMappingErrorContext) {
  return routeErrorResponse(error, 'TANGO MAPPING', context);
}