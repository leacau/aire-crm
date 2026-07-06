'use client';

import { apiRequest } from '@/lib/api-client';
import type { Agency } from '@/lib/types';

export async function getAgencies(): Promise<Agency[]> {
  const result = await apiRequest<{ agencies: Agency[] }>('/api/agencies', { method: 'GET' });
  return result.agencies;
}

export async function createAgency(agencyData: Omit<Agency, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/agencies', {
    method: 'POST',
    body: { agencyData },
  });
  return result.id;
}

