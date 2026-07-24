import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { ConvenioApiError } from '@/lib/server/convenios';

type ConvenioErrorContext = RouteErrorContext;

export function convenioErrorResponse(error: unknown, context: ConvenioErrorContext) {
  if (error instanceof ConvenioApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'CONVENIO', context);
}