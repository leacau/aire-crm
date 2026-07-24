import { routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';

type InvoiceErrorContext = RouteErrorContext;

export function invoiceErrorResponse(error: unknown, context: InvoiceErrorContext) {
  return routeErrorResponse(error, 'INVOICES', context, { exposeClientError: true });
}