'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { AdvertisingOrder } from '@/lib/types';
import { getAdvertisingOrdersWithEvent } from '@/lib/firebase-service';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

const actionSummary = (order: AdvertisingOrder) => {
  const totals = new Map<string, number>();
  (order.srlItems || []).forEach(item => {
    const quantity = Object.values(item.dailySpots || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const label = item.adType === 'Personalizado' ? item.customType || 'Personalizado' : item.adType || 'Acción';
    totals.set(label, (totals.get(label) || 0) + quantity);
  });
  (order.sasItems || []).forEach(item => {
    const label = item.format || item.type || 'Digital';
    totals.set(label, (totals.get(label) || 0) + 1);
  });
  return [...totals.entries()].map(([label, quantity]) => `${label}: ${quantity}`).join(' · ') || 'Sin acciones detalladas';
};

export function EventSummary() {
  const [orders, setOrders] = useState<AdvertisingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdvertisingOrdersWithEvent().then(setOrders).finally(() => setLoading(false));
  }, []);

  const events = useMemo(() => {
    const groups = new Map<string, AdvertisingOrder[]>();
    orders.forEach(order => {
      const event = order.event!.trim();
      groups.set(event, [...(groups.get(event) || []), order]);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'es'));
  }, [orders]);

  if (loading) return <div className="flex min-h-48 items-center justify-center"><Spinner size="large" /></div>;
  if (!events.length) return <div className="py-16 text-center text-muted-foreground">Todavía no hay órdenes agrupadas por evento.</div>;

  return <div className="space-y-5">
    {events.map(([event, eventOrders]) => {
      const clients = new Set(eventOrders.map(order => order.clientName).filter(Boolean));
      const total = eventOrders.reduce((sum, order) => sum + Number(order.totalOrder || 0), 0);
      return <section key={event} className="overflow-hidden rounded-md border bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
          <div><h3 className="font-bold text-slate-900">{event}</h3><p className="text-xs text-muted-foreground">{clients.size} clientes · {eventOrders.length} órdenes</p></div>
          <Badge variant="outline">Total: ${total.toLocaleString('es-AR')}</Badge>
        </header>
        <div className="divide-y">
          {eventOrders.map(order => <div key={order.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.2fr_1fr_2fr_auto] md:items-center">
            <div><p className="font-semibold">{order.clientName}</p><p className="text-xs text-muted-foreground">{order.product || order.opportunityTitle}</p></div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{format(parseISO(order.startDate), 'dd/MM/yyyy')} al {format(parseISO(order.endDate), 'dd/MM/yyyy')}</div>
            <p className="text-xs text-slate-600">{actionSummary(order)}</p>
            <Link href={`/publicidad/${order.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver OP <ExternalLink className="h-3 w-3" /></Link>
          </div>)}
        </div>
      </section>;
    })}
  </div>;
}
