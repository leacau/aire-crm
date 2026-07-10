'use client';

import { apiRequest } from '@/lib/api-client';
import type { Invoice, Opportunity, OpportunityPeriod } from '@/lib/types';

type UpdateOpportunityResponse = {
  ok: true;
  originalData: Opportunity;
  stageChanged: boolean;
  isRenewal: boolean;
  newRenewals: OpportunityPeriod[];
  createdCommercialItems: number;
  createdInvoices: number;
};

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

export async function getOpportunityById(opportunityId: string): Promise<Opportunity | null> {
  const result = await apiRequest<{ opportunity: Opportunity | null }>(
    `/api/opportunities/${encodeURIComponent(opportunityId)}`,
    { method: 'GET' },
  );
  return result.opportunity;
}

export async function createOpportunity(opportunityData: Omit<Opportunity, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/opportunities', {
    method: 'POST',
    body: { opportunityData },
  });
  return result.id;
}

export async function createQuickOpportunity(title: string, clientId: string, clientName: string): Promise<string> {
  return createOpportunity({
    title,
    clientId,
    clientName,
    stage: 'Propuesta',
    value: 0,
    closeDate: '',
    createdAt: new Date().toISOString(),
  });
}

export async function updateOpportunity(
  opportunityId: string,
  data: Partial<Omit<Opportunity, 'id'>>,
  pendingInvoices?: Omit<Invoice, 'id' | 'opportunityId'>[],
  options?: { manageContractPeriods?: boolean },
): Promise<UpdateOpportunityResponse> {
  return apiRequest<UpdateOpportunityResponse>(`/api/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'PATCH',
    body: { data, pendingInvoices, options },
  });
}

export async function deleteOpportunity(opportunityId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'DELETE',
  });
}
