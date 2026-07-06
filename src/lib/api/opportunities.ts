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

