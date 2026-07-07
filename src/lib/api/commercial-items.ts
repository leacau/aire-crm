'use client';

import { apiRequest } from '@/lib/api-client';
import type { CommercialItem } from '@/lib/types';

export async function getCommercialItems(date: string): Promise<CommercialItem[]> {
  const result = await apiRequest<{ items: CommercialItem[] }>(
    `/api/commercial-items?date=${encodeURIComponent(date)}`,
    { method: 'GET' },
  );
  return result.items;
}

export async function getCommercialItemsBySeries(seriesId: string): Promise<CommercialItem[]> {
  const result = await apiRequest<{ items: CommercialItem[] }>(
    `/api/commercial-items/series/${encodeURIComponent(seriesId)}`,
    { method: 'GET' },
  );
  return result.items;
}

export async function saveCommercialItemSeries(
  item: Omit<CommercialItem, 'id' | 'date'>,
  dates: Date[],
  isEditingSeries?: boolean,
): Promise<string | void> {
  const result = await apiRequest<{ seriesId: string }>('/api/commercial-items/series', {
    method: 'POST',
    body: { item, dates, isEditingSeries },
  });
  return result.seriesId;
}

export async function createCommercialItem(itemData: Omit<CommercialItem, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/commercial-items', {
    method: 'POST',
    body: { itemData },
  });
  return result.id;
}

export async function updateCommercialItem(
  itemId: string,
  itemData: Partial<Omit<CommercialItem, 'id'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { itemData },
  });
}

export async function deleteCommercialItem(itemIds: string[], logDeletion = false): Promise<void> {
  await apiRequest<{ ok: true }>('/api/commercial-items/bulk-delete', {
    method: 'POST',
    body: { itemIds, logDeletion },
  });
}
