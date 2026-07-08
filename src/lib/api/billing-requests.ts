'use client';

import { apiRequest } from '@/lib/api-client';
import type { BillingRequest } from '@/lib/types';

export type BillingRequestWithMetadata = BillingRequest & {
  accountExecutive: string;
  advisorId: string;
  opportunityTitle: string;
  clientDisplayName: string;
  cuit: string;
  billingStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado';
  invoiceNumber: string;
};

export async function getAllBillingRequestsWithMetadata(): Promise<BillingRequestWithMetadata[]> {
  const result = await apiRequest<{ requests: BillingRequestWithMetadata[] }>('/api/billing-requests', {
    method: 'GET',
  });
  return result.requests;
}

export async function getBillingRequestsByOrder(orderId: string): Promise<BillingRequest[]> {
  const result = await apiRequest<{ billingRequests: BillingRequest[] }>(
    `/api/billing-requests/order/${encodeURIComponent(orderId)}`,
    { method: 'GET' },
  );
  return result.billingRequests;
}

export async function updateBillingRequestStatus(
  requestId: string,
  newStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado',
  invoiceNumber?: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/billing-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: { billingStatus: newStatus, invoiceNumber },
  });
}
