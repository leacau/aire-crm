'use client';

import { apiRequest } from '@/lib/api-client';
import type { PaymentEntry } from '@/lib/types';

export type PaymentImportRow = Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>;

export async function getPaymentEntries(): Promise<PaymentEntry[]> {
  const result = await apiRequest<{ payments: PaymentEntry[] }>('/api/payments', { method: 'GET' });
  return result.payments;
}

export async function getPendingPaymentEntries(): Promise<PaymentEntry[]> {
  const result = await apiRequest<{ payments: PaymentEntry[] }>('/api/payments?pending=true', { method: 'GET' });
  return result.payments;
}

export async function replacePaymentEntriesForAdvisor(
  advisorId: string,
  advisorName: string,
  rows: PaymentImportRow[],
): Promise<void> {
  await apiRequest<{ ok: true }>('/api/payments', {
    method: 'POST',
    body: { advisorId, advisorName, rows },
  });
}

export async function updatePaymentEntry(
  paymentId: string,
  updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
  audit?: { ownerName?: string; details?: string },
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/payments/${encodeURIComponent(paymentId)}`, {
    method: 'PATCH',
    body: { updates, audit },
  });
}

export async function requestPaymentExplanation(
  paymentId: string,
  params: { advisorName?: string; note?: string; comprobanteNumber?: string | null },
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/payments/${encodeURIComponent(paymentId)}/explanation`, {
    method: 'POST',
    body: params,
  });
}

export async function deletePaymentEntries(paymentIds: string[]): Promise<void> {
  await apiRequest<{ ok: true }>('/api/payments', {
    method: 'DELETE',
    body: { paymentIds },
  });
}
