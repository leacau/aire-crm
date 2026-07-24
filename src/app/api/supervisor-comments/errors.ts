import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type SupervisorCommentErrorContext = RouteErrorContext;

export function supervisorCommentErrorResponse(error: unknown, context: SupervisorCommentErrorContext) {
  return routeErrorResponse(error, 'SUPERVISOR COMMENTS', context, { exposeClientError: true });
}