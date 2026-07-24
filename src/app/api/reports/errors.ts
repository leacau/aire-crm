import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type ReportErrorContext = RouteErrorContext;

export function reportErrorResponse(error: unknown, context: ReportErrorContext) {
  return routeErrorResponse(error, 'REPORTS', context, { exposeClientError: true });
}