'use client';

import { Mic } from 'lucide-react';
import type { ScheduledPnt } from '@/lib/api/pnts';

type ScheduledPntRowProps = {
  item: ScheduledPnt;
};

export function ScheduledPntRow({ item }: ScheduledPntRowProps) {
  return (
    <div className="flex items-center space-x-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
      <Mic className="h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-semibold leading-none">
          PNT pendiente - {item.clientName}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-800">
          <span>{item.quantity > 1 ? `${item.quantity} PNTs programados` : '1 PNT programado'}</span>
          {item.product && <span className="truncate">Producto: {item.product}</span>}
          {item.hasTv && <span>Con TV</span>}
        </div>
      </div>
    </div>
  );
}
