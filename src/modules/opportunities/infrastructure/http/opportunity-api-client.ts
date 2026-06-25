'use client';

import { ApiClientError, apiRequest } from '@/core/http/api-client';
import { getClients } from '@/modules/clients/client';
import type { Opportunity } from '../../domain/opportunity';

const API_PATH = '/api/v1/opportunities';
const CACHE_DURATION_MS = 3 * 60 * 1000;
const cache = new Map<string, { data: Opportunity[]; expiresAt: number }>();

async function list(scope: 'active' | 'all', clientId?: string): Promise<Opportunity[]> {
  const key = `${scope}:${clientId || 'all'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const params = new URLSearchParams({ scope });
  if (clientId) params.set('clientId', clientId);
  const opportunities = await apiRequest<Opportunity[]>(`${API_PATH}?${params}`);
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
