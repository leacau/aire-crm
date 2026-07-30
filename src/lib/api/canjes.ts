'use client';

import { apiRequest } from '@/lib/api-client';
import type { AdvertisingOrder, Canje } from '@/lib/types';

export async function getCanjes(): Promise<Canje[]> {
  const result = await apiRequest<{ canjes: Canje[] }>('/api/canjes', { method: 'GET' });
  return result.canjes;
}

export async function createCanje(canjeData: Omit<Canje, 'id' | 'fechaCreacion'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/canjes', {
    method: 'POST',
    body: { canjeData },
  });
  return result.id;
}

export async function updateCanje(id: string, data: Partial<Omit<Canje, 'id'>>): Promise<void> {
  const deleteKeys = Object.entries(data)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);

  await apiRequest<{ ok: true }>(`/api/canjes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data, deleteKeys },
  });
}

export async function deleteCanje(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/canjes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getAdvertisingOrdersByCanjeId(
  canjeId: string,
  legacyOrderIds: string[] = [],
): Promise<AdvertisingOrder[]> {
  const params = new URLSearchParams();
  legacyOrderIds.forEach(orderId => params.append('legacyOrderId', orderId));
  const query = params.toString();
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>(
    `/api/canjes/${encodeURIComponent(canjeId)}/advertising-orders${query ? `?${query}` : ''}`,
    { method: 'GET' },
  );
  return result.orders;
}
