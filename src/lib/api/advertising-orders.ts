'use client';

import { apiRequest } from '@/lib/api-client';
import type { AdvertisingOrder, ApprovalHistoryItem, BillingRequest } from '@/lib/types';

type AdvertisingOrderPayload = Omit<AdvertisingOrder, 'id' | 'createdAt'> & {
  billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[];
};

type AdvertisingOrderUpdatePayload = Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>> & {
  billingRequestsAvion?: Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>[];
};

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

export async function createAdvertisingOrder(orderData: AdvertisingOrderPayload): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/advertising-orders', {
    method: 'POST',
    body: { orderData },
  });
  return result.id;
}

export async function updateAdvertisingOrder(
  orderId: string,
  orderData: AdvertisingOrderUpdatePayload,
  userId: string,
  userName: string,
  options?: {
    modificationReason?: string;
    userRole?: string;
    historyItem?: ApprovalHistoryItem;
  },
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/advertising-orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: { orderData, userId, userName, options },
  });
}

export async function deleteAdvertisingOrder(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/advertising-orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
