import { NextResponse } from 'next/server';
import { listAdvertisingOrdersServer } from '@/lib/server/advertising-orders';
import { listClientAdvertisingOrdersServer } from '@/lib/server/clients';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { routeErrorResponse } from '@/lib/server/route-errors';
import { toMobileAdvertisingOrderSummary } from '@/lib/mobile-advertising-orders';

const MAX_MOBILE_ORDERS = 80;

function getStatusFilter(value: string | null) {
  return value && value !== 'all' ? value : null;
}

export async function GET(request: Request) {
  const context = await requireMobileSession(request);
  if (isMobileSessionResponse(context)) return context;

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const opportunityId = searchParams.get('opportunityId');
    const status = getStatusFilter(searchParams.get('status'));

    const orders = clientId
      ? await listClientAdvertisingOrdersServer(clientId, context.requester)
      : await listAdvertisingOrdersServer({
        opportunityId,
        recent: !opportunityId,
      }, context.requester);

    const filteredOrders = status
      ? orders.filter(order => (order.status || 'Pendiente') === status)
      : orders;

    return NextResponse.json({
      orders: filteredOrders
        .slice(0, MAX_MOBILE_ORDERS)
        .map(toMobileAdvertisingOrderSummary),
    });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'ADVERTISING ORDERS',
      requesterId: context.requester.uid,
      publicError: 'No se pudieron cargar las ordenes de publicidad mobile.',
    });
  }
}
