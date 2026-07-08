'use client';

import { apiRequest } from '@/lib/api-client';
import type { Invoice } from '@/lib/types';

export async function getInvoices(): Promise<Invoice[]> {
  const result = await apiRequest<{ invoices: Invoice[] }>('/api/invoices', { method: 'GET' });
  return result.invoices;
}

export async function getInvoicesForOpportunity(opportunityId: string): Promise<Invoice[]> {
  const params = new URLSearchParams({ opportunityId });
  const result = await apiRequest<{ invoices: Invoice[] }>(`/api/invoices?${params}`, { method: 'GET' });
  return result.invoices;
}

export async function createInvoice(invoiceData: Omit<Invoice, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/invoices', {
    method: 'POST',
    body: { invoiceData },
  });
  return result.id;
}

export async function updateInvoice(id: string, data: Partial<Omit<Invoice, 'id'>>): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/invoices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deleteInvoice(id: string, ownerName: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/invoices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: { ownerName },
  });
}
