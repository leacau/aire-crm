import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type ProgramErrorContext = RouteErrorContext;

export function programErrorResponse(error: unknown, context: ProgramErrorContext) {
  return routeErrorResponse(error, 'PROGRAMS', context, { exposeClientError: true });
}