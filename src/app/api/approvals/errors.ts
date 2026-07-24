import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { ApprovalApiError } from '@/lib/server/approvals';

type ApprovalErrorContext = RouteErrorContext;

export function approvalErrorResponse(error: unknown, context: ApprovalErrorContext) {
  if (error instanceof ApprovalApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'APPROVALS', context);
}