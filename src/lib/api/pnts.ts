'use client';

import { apiRequest } from '@/lib/api-client';

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

export async function getScheduledPnts(date: string): Promise<ScheduledPnt[]> {
  const result = await apiRequest<{ scheduledPnts: ScheduledPnt[] }>(
    `/api/pnts/scheduled?date=${encodeURIComponent(date)}`,
    { method: 'GET' },
  );
  return result.scheduledPnts;
}
