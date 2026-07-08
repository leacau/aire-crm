'use client';

import { apiRequest } from '@/lib/api-client';
import type { Opportunity } from '@/lib/types';

export async function getOpportunities(): Promise<Opportunity[]> {
  const result = await apiRequest<{ opportunities: Opportunity[] }>('/api/opportunities?scope=active', {
    method: 'GET',
  });
  return result.opportunities;
}

export async function getAllOpportunities(): Promise<Opportunity[]> {
  const result = await apiRequest<{ opportunities: Opportunity[] }>('/api/opportunities?scope=all', {
    method: 'GET',
  });
  return result.opportunities;
}

export async function getOpportunitiesForUser(userId: string): Promise<Opportunity[]> {
  const result = await apiRequest<{ opportunities: Opportunity[] }>(
    `/api/opportunities?scope=user&userId=${encodeURIComponent(userId)}`,
    { method: 'GET' },
  );
  return result.opportunities;
}

export async function createOpportunity(opportunityData: Omit<Opportunity, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/opportunities', {
    method: 'POST',
    body: { opportunityData },
  });
  return result.id;
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'DELETE',
  });
}
