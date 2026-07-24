import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type SocialMediaRequestErrorContext = RouteErrorContext;

export function socialMediaRequestErrorResponse(error: unknown, context: SocialMediaRequestErrorContext) {
  return routeErrorResponse(error, 'SOCIAL MEDIA REQUESTS', context, { exposeClientError: true });
}