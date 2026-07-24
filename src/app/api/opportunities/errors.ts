import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type OpportunityErrorContext = RouteErrorContext;

export function opportunityErrorResponse(error: unknown, context: OpportunityErrorContext) {
  return routeErrorResponse(error, 'OPPORTUNITIES', context, { exposeClientError: true });
}