'use client';

import { apiRequest } from '@/lib/api-client';
import type { Prospect } from '@/lib/types';

export type UpdateProspectResponse = {
  ok: true;
  originalData: Prospect;
};

export async function getProspects(): Promise<Prospect[]> {
  const result = await apiRequest<{ prospects: Prospect[] }>('/api/prospects', { method: 'GET' });
  return result.prospects;
}

export async function createProspect(
  prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/prospects', {
    method: 'POST',
    body: { prospectData },
  });
  return result.id;
}

export async function updateProspect(
  prospectId: string,
  data: Partial<Omit<Prospect, 'id'>>,
): Promise<UpdateProspectResponse> {
  return apiRequest<UpdateProspectResponse>(`/api/prospects/${encodeURIComponent(prospectId)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deleteProspect(prospectId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/prospects/${encodeURIComponent(prospectId)}`, {
    method: 'DELETE',
  });
}
