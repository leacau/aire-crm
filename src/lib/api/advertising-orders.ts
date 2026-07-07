'use client';

import { apiRequest } from '@/lib/api-client';
import type { AdvertisingOrder } from '@/lib/types';

export async function getAdvertisingOrdersByOpportunity(opportunityId: string): Promise<AdvertisingOrder[]> {
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>(
    `/api/advertising-orders?opportunityId=${encodeURIComponent(opportunityId)}`,
    { method: 'GET' },
  );
  return result.orders;
}

export async function getAdvertisingOrdersWithEvent(): Promise<AdvertisingOrder[]> {
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>('/api/advertising-orders?withEvent=true', {
    method: 'GET',
  });
  return result.orders;
}

export async function getAdvertisingOrder(id: string): Promise<AdvertisingOrder | null> {
  const result = await apiRequest<{ order: AdvertisingOrder | null }>(
    `/api/advertising-orders/${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  return result.order;
}

export async function getRecentAdvertisingOrders(): Promise<AdvertisingOrder[]> {
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>('/api/advertising-orders?recent=true', {
    method: 'GET',
  });
  return result.orders;
}

export async function getAdvertisingOrdersForDateRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<AdvertisingOrder[]> {
  const params = new URLSearchParams({
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
  });
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>(`/api/advertising-orders?${params}`, {
    method: 'GET',
  });
  return result.orders;
}
