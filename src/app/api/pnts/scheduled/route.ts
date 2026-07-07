import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import type { AdvertisingOrder, AdvertisingOrderItemSrl } from '@/lib/types';

export type ScheduledPnt = {
  id: string;
  date: string;
  programId: string;
  clientId: string;
  clientName: string;
  orderId?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  product?: string;
  quantity: number;
  hasTv?: boolean;
};

function normalizeDateParam(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function isPntItem(item: AdvertisingOrderItemSrl): boolean {
  const adType = item.adType?.trim().toLowerCase() || '';
  const customType = item.customType?.trim().toLowerCase() || '';
  return adType === 'pnt' || customType.includes('pnt');
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const date = normalizeDateParam(searchParams.get('date'));

  if (!date) {
    return NextResponse.json({ error: 'La fecha es obligatoria.' }, { status: 400 });
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const snapshot = await dbAdmin
    .collection('advertising_orders')
    .where('startDate', '<=', dayEnd)
    .get();

  const scheduledPnts: ScheduledPnt[] = [];

  snapshot.docs.forEach(doc => {
    const order = { id: doc.id, ...doc.data() } as AdvertisingOrder;
    if ((order.endDate || '').slice(0, 10) < date) return;
    if (order.status === 'Devuelto') return;

    (order.srlItems || []).forEach((item, itemIndex) => {
      if (!item.programId || item.programId === 'Personalizado') return;
      if (!isPntItem(item)) return;

      const quantity = Number(item.dailySpots?.[date] || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;

      scheduledPnts.push({
        id: `${doc.id}:${itemIndex}:${date}`,
        date,
        programId: item.programId,
        clientId: order.clientId,
        clientName: order.clientName || order.clientRazonSocial || 'Cliente sin nombre',
        orderId: doc.id,
        opportunityId: order.opportunityId,
        opportunityTitle: order.opportunityTitle,
        product: order.product,
        quantity,
        hasTv: item.hasTv,
      });
    });
  });

  scheduledPnts.sort((a, b) => a.clientName.localeCompare(b.clientName));

  return NextResponse.json({ scheduledPnts });
}
