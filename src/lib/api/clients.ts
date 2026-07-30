'use client';

import { apiRequest } from '@/lib/api-client';
import type { AdvertisingOrder, BillingRequest, Client, ClientActivity, Opportunity, Person } from '@/lib/types';
import type {
  ClientTangoIdField,
  ClientTangoMappingOptions,
  ClientTangoSyncedField,
  ClientTangoUpdate,
} from '@/lib/api-contracts';

export type ClientTangoBillingSummary = {
  total: number;
  invoiceCount: number;
  truncated: boolean;
  byCompany: Array<{
    companyId: string;
    companyLabel: string;
    clientCode: string;
    total: number;
    invoiceCount: number;
    truncated: boolean;
  }>;
  skippedCompanies: Array<{ companyId: string; label: string; reason: string }>;
};

export type {
  ClientTangoIdField,
  ClientTangoMappingOptions,
  ClientTangoSyncedField,
  ClientTangoUpdate,
} from '@/lib/api-contracts';

export async function getClients(): Promise<Client[]> {
  const result = await apiRequest<{ clients: Client[] }>('/api/clients', { method: 'GET' });
  return result.clients;
}

export async function getClient(id: string): Promise<Client | null> {
  const result = await apiRequest<{ client: Client | null }>(`/api/clients/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  return result.client;
}

export async function createClient(
  clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>,
  ownerId?: string,
  ownerName?: string,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/clients', {
    method: 'POST',
    body: { clientData, ownerId, ownerName },
  });
  return result.id;
}

export async function updateClient(id: string, data: Partial<Omit<Client, 'id'>>): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/clients/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deleteClient(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/clients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function bulkDeleteClients(clientIds: string[]): Promise<void> {
  await apiRequest<{ ok: true }>('/api/clients/bulk', {
    method: 'DELETE',
    body: { clientIds },
  });
}

export async function bulkUpdateClients(
  updates: { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[],
): Promise<void> {
  await apiRequest<{ ok: true }>('/api/clients/bulk', {
    method: 'PATCH',
    body: { updates },
  });
}

export async function updateClientTangoMapping(
  id: string,
  data: ClientTangoUpdate,
  options: ClientTangoMappingOptions = {},
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/clients/${encodeURIComponent(id)}/tango-mapping`, {
    method: 'PATCH',
    body: { data, ...options },
  });
}

export async function undoClientTangoMapping(
  id: string,
  crmIdField: ClientTangoIdField,
  syncedField: ClientTangoSyncedField,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/clients/${encodeURIComponent(id)}/tango-mapping`, {
    method: 'DELETE',
    body: { crmIdField, syncedField },
  });
}

export async function mergeClients(targetClientId: string, sourceClientId: string): Promise<void> {
  await apiRequest<{ ok: true }>('/api/clients/merge', {
    method: 'POST',
    body: { targetClientId, sourceClientId },
  });
}

export async function getAdvertisingOrdersByClientId(clientId: string): Promise<AdvertisingOrder[]> {
  const result = await apiRequest<{ orders: AdvertisingOrder[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/advertising-orders`,
    { method: 'GET' },
  );
  return result.orders;
}

export async function getOpportunitiesByClientId(clientId: string): Promise<Opportunity[]> {
  const result = await apiRequest<{ opportunities: Opportunity[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/opportunities`,
    { method: 'GET' },
  );
  return result.opportunities;
}

export async function getBillingRequestsByClient(clientId: string): Promise<BillingRequest[]> {
  const result = await apiRequest<{ billingRequests: BillingRequest[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/billing-requests`,
    { method: 'GET' },
  );
  return result.billingRequests;
}

export async function getPeopleByClientId(clientId: string): Promise<Person[]> {
  const result = await apiRequest<{ people: Person[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/people`,
    { method: 'GET' },
  );
  return result.people;
}

export async function getClientActivities(clientId: string): Promise<ClientActivity[]> {
  const result = await apiRequest<{ activities: ClientActivity[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/activities`,
    { method: 'GET' },
  );
  return result.activities;
}

export async function getClientTangoBillingSummary(clientId: string): Promise<ClientTangoBillingSummary> {
  return apiRequest<ClientTangoBillingSummary>(
    `/api/clients/${encodeURIComponent(clientId)}/tango-billing-summary`,
    { method: 'GET' },
  );
}
