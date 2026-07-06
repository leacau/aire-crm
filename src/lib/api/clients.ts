'use client';

import { apiRequest } from '@/lib/api-client';
import type { AdvertisingOrder, BillingRequest, Client, ClientActivity, Invoice, Opportunity, Person } from '@/lib/types';

export type ClientTangoUpdate = {
  cuit?: string;
  tangoCompanyId?: string;
  idTango?: string;
  email?: string;
  phone?: string;
  rubro?: string;
  razonSocial?: string;
  razonSocialTango?: string;
  denominacion?: string;
  idAireSrl?: string;
  idAireDigital?: string;
  idAire?: string;
  condicionIVA?: string;
  provincia?: string;
  localidad?: string;
  tipoEntidad?: string;
  observaciones?: string;
};

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

export async function updateClientTangoMapping(id: string, data: ClientTangoUpdate): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/clients/${encodeURIComponent(id)}/tango-mapping`, {
    method: 'PATCH',
    body: { data },
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

export async function getInvoicesForClient(clientId: string): Promise<Invoice[]> {
  const result = await apiRequest<{ invoices: Invoice[] }>(
    `/api/clients/${encodeURIComponent(clientId)}/invoices`,
    { method: 'GET' },
  );
  return result.invoices;
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
