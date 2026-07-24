import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type PeopleErrorContext = RouteErrorContext;

export function peopleErrorResponse(error: unknown, context: PeopleErrorContext) {
  return routeErrorResponse(error, 'PEOPLE', context);
}