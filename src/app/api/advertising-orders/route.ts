import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  createAdvertisingOrderServer,
  listAdvertisingOrdersServer,
} from '@/lib/server/advertising-orders';
import { advertisingOrderErrorResponse } from '@/app/api/advertising-orders/errors';
import type { AdvertisingOrder } from '@/lib/types';

function getDateParam(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get('opportunityId');
    const withEvent = searchParams.get('withEvent') === 'true';
    const recent = searchParams.get('recent') === 'true';
    const rangeStart = getDateParam(searchParams.get('rangeStart'));
    const rangeEnd = getDateParam(searchParams.get('rangeEnd'));

    const orders = await listAdvertisingOrdersServer({
      opportunityId,
      withEvent,
      recent,
      rangeStart,
      rangeEnd,
    }, requester);
    return NextResponse.json({ orders });
  } catch (error) {
    return advertisingOrderErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las ordenes de publicidad.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const orderData = body?.orderData as Omit<AdvertisingOrder, 'id' | 'createdAt'>;
    const id = await createAdvertisingOrderServer(orderData, requester);
    return NextResponse.json({ id });
  } catch (error) {
    return advertisingOrderErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la orden de publicidad.',
    });
  }
}
