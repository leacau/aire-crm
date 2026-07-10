'use client';

import { apiRequest } from '@/lib/api-client';
import type { Invoice } from '@/lib/types';

export type InvoiceBatchDeleteResult = {
  deleted: string[];
  failed: { id: string; error: string }[];
};

export type InvoiceBatchDeleteProgress = InvoiceBatchDeleteResult & {
  total: number;
  processed: number;
  chunk: string[];
};

type InvoiceBatchDeleteOptions = {
  batchSize?: number;
  onProgress?: (progress: InvoiceBatchDeleteProgress) => void;
  resolveOwnerName?: (invoiceId: string) => string;
};

export async function getInvoices(): Promise<Invoice[]> {
  const result = await apiRequest<{ invoices: Invoice[] }>('/api/invoices', { method: 'GET' });
  return result.invoices;
}

export async function getDashboardInvoices(): Promise<Invoice[]> {
  const result = await apiRequest<{ invoices: Invoice[] }>('/api/invoices?dashboard=true', {
    method: 'GET',
  });
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

export async function deleteInvoicesInBatches(
  ids: string[],
  options: InvoiceBatchDeleteOptions = {},
): Promise<InvoiceBatchDeleteResult> {
  const { batchSize = 25, onProgress, resolveOwnerName } = options;
  const result: InvoiceBatchDeleteResult = { deleted: [], failed: [] };
  const total = ids.length;
  const chunks: string[][] = [];

  for (let index = 0; index < ids.length; index += batchSize) {
    chunks.push(ids.slice(index, index + batchSize));
  }

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map(async (invoiceId) => {
        const ownerName = resolveOwnerName?.(invoiceId) || 'Cliente';
        await deleteInvoice(invoiceId, ownerName);
      }),
    );

    settled.forEach((res, index) => {
      const invoiceId = chunk[index];
      if (res.status === 'fulfilled') {
        result.deleted.push(invoiceId);
      } else {
        const message = res.reason instanceof Error ? res.reason.message : String(res.reason);
        result.failed.push({ id: invoiceId, error: message });
      }
    });

    const processed = result.deleted.length + result.failed.length;
    onProgress?.({
      total,
      processed,
      chunk,
      deleted: [...result.deleted],
      failed: [...result.failed],
    });
  }

  return result;
}
