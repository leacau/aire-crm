import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { mapAdvertisingOrder } from '@/app/api/advertising-orders/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { canAccessAdvertisingOrder } from '@/lib/server/advertising-order-access';
import {
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
    const snap = await dbAdmin.collection('advertising_orders').doc(orderId).get();
    if (!snap.exists) {
      return NextResponse.json({ order: null });
    }

    const order = mapAdvertisingOrder(snap.id, snap.data());
    if (!(await canAccessAdvertisingOrder(order, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      order,
    });
  } catch (error: any) {
    console.error('ADVERTISING ORDER DETAIL ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo cargar la orden de publicidad.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { orderId } = await context.params;
    const body = await request.json();
    const snap = await dbAdmin.collection('advertising_orders').doc(orderId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }
    const order = mapAdvertisingOrder(snap.id, snap.data());
    if (!(await canAccessAdvertisingOrder(order, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requesterName = getRequesterName(requester);
    await updateAdvertisingOrderServer(
      orderId,
      body?.orderData as Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>>,
      requester.uid,
      requesterName,
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
    const docRef = dbAdmin.collection('advertising_orders').doc(orderId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    const order = mapAdvertisingOrder(snap.id, snap.data());
    if (!hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.delete();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'opportunity' as any,
      entityId: orderId,
      entityName: 'Orden de Publicidad',
      details: `elimino una orden de publicidad del cliente <strong>${order.clientName || 'Cliente'}</strong>`,
      ownerName: 'Sistema',
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('ADVERTISING ORDER DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo eliminar la orden de publicidad.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
