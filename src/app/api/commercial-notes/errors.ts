import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type CommercialNoteErrorContext = RouteErrorContext;

export function commercialNoteErrorResponse(error: unknown, context: CommercialNoteErrorContext) {
  return routeErrorResponse(error, 'COMMERCIAL NOTES', context, { exposeClientError: true });
}