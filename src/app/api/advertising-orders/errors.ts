import { routeApiErrorResponse, routeErrorResponse, type RouteErrorContext } from '@/lib/server/route-errors';
import { AdvertisingOrderApiError } from '@/lib/server/advertising-orders';

type AdvertisingOrderErrorContext = RouteErrorContext;

export function advertisingOrderErrorResponse(error: unknown, context: AdvertisingOrderErrorContext) {
  if (error instanceof AdvertisingOrderApiError) {
    return routeApiErrorResponse(error);
  }

  return routeErrorResponse(error, 'ADVERTISING ORDER', context);
}