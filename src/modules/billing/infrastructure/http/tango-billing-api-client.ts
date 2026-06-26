'use client';

import { apiRequest } from '@/core/http/api-client';
import type {
  ClientTangoInvoiceQuery,
  TangoBillingSummary,
  TangoInvoice,
  TangoInvoiceQuery,
  TangoInvoiceResult,
} from '../../domain/tango-invoice';

const API_PATH = '/api/v1/billing';

function buildParams(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (typeof value === 'string' && value) params.set(key, value);
  });
  return params;
}

export function getTangoInvoices(query: TangoInvoiceQuery): Promise<TangoInvoiceResult> {
  return apiRequest<TangoInvoiceResult>(`${API_PATH}/tango-invoices?${buildParams(query)}`);
}

export function getClientTangoInvoices(query: ClientTangoInvoiceQuery): Promise<TangoInvoice[]> {
  return apiRequest<TangoInvoice[]>(`${API_PATH}/tango-client-invoices?${buildParams(query)}`);
}

export function getCurrentMonthTangoBillingSummary(): Promise<TangoBillingSummary> {
  return apiRequest<TangoBillingSummary>(`${API_PATH}/tango-summary/current-month`);
}
