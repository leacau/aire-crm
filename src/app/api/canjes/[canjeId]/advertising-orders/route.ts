import { NextResponse } from 'next/server';
import { canjeErrorResponse } from '@/app/api/canjes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listCanjeAdvertisingOrdersServer } from '@/lib/server/canjes';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const legacyOrderIds = searchParams.getAll('legacyOrderId').filter(Boolean);
    return NextResponse.json({ orders: await listCanjeAdvertisingOrdersServer(canjeId, legacyOrderIds, requester) });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'ADVERTISING ORDERS',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las ordenes del canje.',
    });
  }
}
