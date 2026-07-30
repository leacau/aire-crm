import { NextResponse } from 'next/server';
import { getAdvertisingOrderServer } from '@/lib/server/advertising-orders';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { routeErrorResponse } from '@/lib/server/route-errors';
import { toMobileAdvertisingOrderDetail } from '@/lib/mobile-advertising-orders';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const sessionContext = await requireMobileSession(request);
  if (isMobileSessionResponse(sessionContext)) return sessionContext;

  try {
    const { orderId } = await context.params;

    if (!orderId) {
      return NextResponse.json({ error: 'Orden invalida.' }, { status: 400 });
    }

    const order = await getAdvertisingOrderServer(orderId, sessionContext.requester);
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ order: toMobileAdvertisingOrderDetail(order) });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'ADVERTISING ORDER DETAIL',
      requesterId: sessionContext.requester.uid,
      publicError: 'No se pudo cargar la orden de publicidad mobile.',
    });
  }
}
