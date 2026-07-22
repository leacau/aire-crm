'use client';

import { apiFetch } from '@/lib/api-client';

export type TangoClientRecord = {
  COD_CLIENTE: string;
  RAZON_SOCIAL: string;
  NUMERO: string;
  ACTIVIDAD: string | null;
  DOMICILIO: string;
  LOCALIDAD: string;
  TELEFONO: string | null;
  TELEFONO_DEL_CONTACTO: string | null;
};

export type TangoInvoiceRecord = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  NOMBRE_COMERCIAL?: string;
  SUBTOTAL?: number | string | null;
  IVA?: number | string | null;
  TOTAL_SIN_IMPUESTOS?: number | string | null;
  TOTAL_BONIFICADO?: number | string | null;
  ID_GVA14?: number | string | null;
  TOTAL?: number | string | null;
  ID_GVA12?: string | number | null;
  ID_GVA23?: number | string | null;
  ID_GVA38?: number | string | null;
  _company?: string;
  _companyId?: string;
  _companyLabel?: string;
};

export type TangoCollectionRecord = {
  id: string;
  status: 'paid' | 'pending';
  companyLabel: string;
  issueDate: string;
  dueDate: string;
  paymentDate: string;
  voucherType: string;
  voucherNumber: string;
  clientCode: string;
  clientName: string;
  sellerCode: string;
  sellerName: string;
  daysLate: number | null;
  amount: number | null;
  invoiceTotal: number | null;
  imputedAmount: number | null;
  pendingAmount: number | null;
};

export type TangoInvoicesResponse<TInvoice = TangoInvoiceRecord> = {
  list: TInvoice[];
  sourceTotalCount?: number;
  skippedCompanies?: Array<{ label: string; reason: string }>;
  truncated?: boolean;
};

export type TangoCollectionsResponse = {
  list: TangoCollectionRecord[];
  sourceTotalCount?: number;
  canSeeAll?: boolean;
  truncated?: boolean;
};

async function readTangoJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Tango respondio ${response.status}`);
  }

  return payload as T;
}

export async function getTangoClients(company: string): Promise<TangoClientRecord[]> {
  const response = await apiFetch(`/api/tango/clients?company=${encodeURIComponent(company)}`, {
    cache: 'no-store',
  });
  const payload = await readTangoJson<{ resultData?: { list?: TangoClientRecord[] } }>(response);
  return Array.isArray(payload.resultData?.list) ? payload.resultData.list : [];
}

export async function getTangoInvoices<TInvoice = TangoInvoiceRecord>(
  params: Record<string, string>,
): Promise<TangoInvoicesResponse<TInvoice>> {
  const searchParams = new URLSearchParams(params);
  const response = await apiFetch(`/api/tango/invoices?${searchParams.toString()}`, {
    cache: 'no-store',
  });
  const payload = await readTangoJson<TangoInvoicesResponse<TInvoice>>(response);

  return {
    ...payload,
    list: Array.isArray(payload.list) ? payload.list : [],
  };
}

export async function getTangoCollections(
  params: Record<string, string>,
): Promise<TangoCollectionsResponse> {
  const searchParams = new URLSearchParams(params);
  const response = await apiFetch(`/api/tango/collections?${searchParams.toString()}`, {
    cache: 'no-store',
  });
  const payload = await readTangoJson<TangoCollectionsResponse>(response);

  return {
    ...payload,
    list: Array.isArray(payload.list) ? payload.list : [],
  };
}

export async function getTangoInvoicePdf(company: string, id: string): Promise<Blob> {
  const searchParams = new URLSearchParams({ company, id });
  const response = await apiFetch(`/api/tango/invoices/pdf?${searchParams.toString()}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.details || payload?.error || 'Tango no pudo generar el PDF.');
  }

  return response.blob();
}
