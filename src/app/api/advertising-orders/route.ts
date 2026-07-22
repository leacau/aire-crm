import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  canCreateAdvertisingOrderForClient,
  filterAccessibleAdvertisingOrders,
} from '@/lib/server/advertising-order-access';
import {
  createAdvertisingOrderServer,
} from '@/lib/server/advertising-orders';
import { advertisingOrderErrorResponse } from '@/app/api/advertising-orders/errors';
import {
  compareByStartDateDesc,
  isApprovedForProgramming,
  mapAdvertisingOrder,
} from '@/app/api/advertising-orders/utils';
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

    if (opportunityId) {
      const snapshot = await dbAdmin.collection('advertising_orders').where('opportunityId', '==', opportunityId).get();
      const orders = await filterAccessibleAdvertisingOrders(
        snapshot.docs.map(doc => mapAdvertisingOrder(doc.id, doc.data())),
        requester,
      );
      return NextResponse.json({ orders });
    }

    if (withEvent) {
      const snapshot = await dbAdmin.collection('advertising_orders').where('event', '!=', '').get();
      const orders = await filterAccessibleAdvertisingOrders(
        snapshot.docs
          .map(doc => mapAdvertisingOrder(doc.id, doc.data()))
          .filter(order => Boolean(order.event?.trim()))
          .sort(compareByStartDateDesc),
        requester,
      );
      return NextResponse.json({ orders });
    }

    if (recent) {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const snapshot = await dbAdmin
        .collection('advertising_orders')
        .where('createdAt', '>=', twoMonthsAgo.toISOString())
        .orderBy('createdAt', 'desc')
        .get();

      const orders = await filterAccessibleAdvertisingOrders(
        snapshot.docs.map(doc => mapAdvertisingOrder(doc.id, doc.data())),
        requester,
      );
      return NextResponse.json({ orders });
    }

    if (rangeStart && rangeEnd) {
      const snapshot = await dbAdmin
        .collection('advertising_orders')
        .where('startDate', '<=', rangeEnd)
        .orderBy('startDate', 'desc')
        .get();

      const orders = await filterAccessibleAdvertisingOrders(
        snapshot.docs
          .map(doc => mapAdvertisingOrder(doc.id, doc.data()))
          .filter((order: AdvertisingOrder) => {
            const orderEnd = order.endDate || order.startDate;
            return Boolean(orderEnd && orderEnd >= rangeStart && isApprovedForProgramming(order));
          })
          .sort(compareByStartDateDesc),
        requester,
      );

      return NextResponse.json({ orders });
    }

    return NextResponse.json({ error: 'Filtro de ordenes no soportado.' }, { status: 400 });
  } catch (error: any) {
    console.error('ADVERTISING ORDERS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las ordenes de publicidad.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const orderData = body?.orderData as Omit<AdvertisingOrder, 'id' | 'createdAt'>;
    if (!(await canCreateAdvertisingOrderForClient(orderData?.clientId, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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
