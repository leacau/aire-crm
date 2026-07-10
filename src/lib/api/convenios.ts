'use client';

import { apiRequest } from '@/lib/api-client';
import type { ConvenioCanje } from '@/lib/types';

export async function saveConvenioCanje(
  convenioData: Omit<ConvenioCanje, 'id' | 'createdAt'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/convenios', {
    method: 'POST',
    body: { convenioData },
  });
  return result.id;
}

export async function getConveniosCanje(): Promise<ConvenioCanje[]> {
  const result = await apiRequest<{ convenios: ConvenioCanje[] }>('/api/convenios', {
    method: 'GET',
  });
  return result.convenios;
}

export async function updateConvenioCanje(
  id: string,
  data: Partial<Omit<ConvenioCanje, 'id' | 'createdAt'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/convenios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deleteConvenioCanje(id: string, opportunityId?: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/convenios/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: { opportunityId },
  });
}

export async function migrateLegacyConveniosToCanjes(): Promise<{ created: number; skipped: number }> {
  return apiRequest<{ created: number; skipped: number }>('/api/convenios/migrate-to-canjes', {
    method: 'POST',
  });
}
