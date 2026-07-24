import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type PipelineInteractionErrorContext = RouteErrorContext;

export function pipelineInteractionErrorResponse(error: unknown, context: PipelineInteractionErrorContext) {
  return routeErrorResponse(error, 'PIPELINE INTERACTIONS', context);
}