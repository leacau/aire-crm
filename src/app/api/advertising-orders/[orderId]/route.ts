import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteAdvertisingOrderServer,
  getAdvertisingOrderServer,
  updateAdvertisingOrderServer,
} from '@/lib/server/advertising-orders';
import { advertisingOrderErrorResponse } from '@/app/api/advertising-orders/errors';
import type { AdvertisingOrder } from '@/lib/types';

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    const order = await getAdvertisingOrderServer(orderId, requester);
    return NextResponse.json({ order });
  } catch (error) {
    return advertisingOrderErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la orden de publicidad.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    const body = await request.json();
    await updateAdvertisingOrderServer(
      orderId,
      body?.orderData as Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>>,
      requester,
      body?.options,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return advertisingOrderErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la orden de publicidad.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    await deleteAdvertisingOrderServer(orderId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return advertisingOrderErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la orden de publicidad.',
    });
  }
}
