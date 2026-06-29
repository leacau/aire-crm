'use client';

import { ApiClientError, apiReadWithFallback, apiRequest } from '@/core/http/api-client';
import { getClients } from '@/modules/clients/client';
import type { Invoice } from '@/lib/types';
import type { Opportunity } from '../../domain/opportunity';
import { isOpportunityVisibleInActiveScope } from '../../domain/opportunity-visibility';

const API_PATH = '/api/v1/opportunities';
const CACHE_DURATION_MS = 3 * 60 * 1000;
const cache = new Map<string, { data: Opportunity[]; expiresAt: number }>();

function clearOpportunityCache(): void {
  cache.clear();
}

async function list(scope: 'active' | 'all', clientId?: string): Promise<Opportunity[]> {
  const key = `${scope}:${clientId || 'all'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const params = new URLSearchParams({ scope });
  if (clientId) params.set('clientId', clientId);
  const opportunities = await apiReadWithFallback<Opportunity[]>(
    `${API_PATH}?${params}`,
    async () => {
    const firebaseService = await import('@/lib/firebase-service');
      const fallbackOpportunities = clientId
        ? await firebaseService.getOpportunitiesByClientId(clientId)
        : await firebaseService.getAllOpportunities();
      return (scope === 'active'
        ? fallbackOpportunities.filter(opportunity => isOpportunityVisibleInActiveScope(opportunity as Opportunity))
        : fallbackOpportunities) as Opportunity[];
    },
    { circuitKey: API_PATH, label: 'opportunities' },
  );
  cache.set(key, { data: opportunities, expiresAt: Date.now() + CACHE_DURATION_MS });
  return opportunities;
}

export function getOpportunities(options: { forceServer?: boolean } = {}): Promise<Opportunity[]> {
  if (options.forceServer) cache.delete('active:all');
  return list('active');
}

export function getAllOpportunities(): Promise<Opportunity[]> {
  return list('all');
}

export function getOpportunitiesByClientId(clientId: string): Promise<Opportunity[]> {
  return list('all', clientId);
}

export async function getOpportunitiesForUser(userId: string): Promise<Opportunity[]> {
  const [opportunities, clients] = await Promise.all([getAllOpportunities(), getClients()]);
  const clientIds = new Set(clients.filter(client => client.ownerId === userId).map(client => client.id));
  return opportunities.filter(opportunity => clientIds.has(opportunity.clientId));
}

export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  try {
    return await apiRequest<Opportunity>(`${API_PATH}/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function createOpportunity(input: Omit<Opportunity, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>(API_PATH, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  clearOpportunityCache();
  return result.id;
}

export async function updateOpportunity(
  id: string,
  data: Partial<Omit<Opportunity, 'id'>>,
  pendingInvoices?: Array<Omit<Invoice, 'id' | 'opportunityId'>>,
  options?: { manageContractPeriods?: boolean },
): Promise<Partial<Opportunity>> {
  const result = await apiRequest<Partial<Opportunity>>(`${API_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ data, pendingInvoices, options }),
  });
  clearOpportunityCache();
  return result;
}

export async function deleteOpportunity(id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`${API_PATH}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  clearOpportunityCache();
}
