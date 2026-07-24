import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type WebNoteErrorContext = RouteErrorContext;

export function webNoteErrorResponse(error: unknown, context: WebNoteErrorContext) {
  return routeErrorResponse(error, 'WEB NOTES', context, { exposeClientError: true });
}