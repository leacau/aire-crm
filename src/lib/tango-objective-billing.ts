import { format } from 'date-fns';
import { apiFetch } from '@/lib/api-client';
import type { SellerCompanyConfig, User } from '@/lib/types';

export type TangoObjectiveInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  TOTAL?: number | null;
  _companyId?: string;
  _companyLabel?: string;
};

export type TangoBillingSummary = {
  total: number;
  count: number;
  byAdvisor: Record<string, { total: number; count: number }>;
};

const COMPANY_NAME_BY_ID: Record<string, string> = {
  '4': 'Aire',
  '5': 'Aire SRL',
  '6': 'Aire Digital SAS',
};

const normalizeCode = (value: unknown) => {
  const raw = String(value || '').trim();
  const normalized = raw.replace(/^0+/, '');
  return normalized || (raw ? '0' : '');
};

const normalizeCompanyName = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const isFacInvoice = (invoice: TangoObjectiveInvoice) => (
  String(invoice.TIPO_COMPROBANTE || '').trim().toUpperCase() === 'FAC'
);

const isOfficialSeller = (invoice: TangoObjectiveInvoice) => (
  normalizeCompanyName(invoice.NOMBRE_VENDEDOR).includes('oficial')
);

const getInvoiceDate = (invoice: TangoObjectiveInvoice) => (
  String(invoice.FECHA_DE_EMISION || '').slice(0, 10)
);

const getAdvisorCodeIndex = (advisors: User[]) => {
  const index = new Map<string, string>();

  advisors.forEach(advisor => {
    (advisor.sellerConfig || []).forEach((config: SellerCompanyConfig) => {
      const companyName = normalizeCompanyName(config.companyName);
      (config.codes || []).forEach(code => {
        const normalizedCode = normalizeCode(code);
        if (companyName && normalizedCode) {
          index.set(`${companyName}|${normalizedCode}`, advisor.id);
        }
      });
    });
  });

  return index;
};

export async function fetchTangoObjectiveInvoices(fromDate: Date, toDate: Date) {
  const params = new URLSearchParams({
    company: 'all',
    fromDate: format(fromDate, 'yyyy-MM-dd'),
    toDate: format(toDate, 'yyyy-MM-dd'),
  });

  const response = await apiFetch(`/api/tango/invoices?${params.toString()}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Tango respondio ${response.status}`);
  }

  return (Array.isArray(payload.list) ? payload.list : []) as TangoObjectiveInvoice[];
}

export function summarizeTangoObjectiveBilling(
  invoices: TangoObjectiveInvoice[],
  fromDate: Date,
  toDate: Date,
  advisors: User[] = [],
): TangoBillingSummary {
  const from = format(fromDate, 'yyyy-MM-dd');
  const to = format(toDate, 'yyyy-MM-dd');
  const advisorCodeIndex = getAdvisorCodeIndex(advisors);
  const byAdvisor: TangoBillingSummary['byAdvisor'] = {};

  let total = 0;
  let count = 0;

  invoices.forEach(invoice => {
    const issueDate = getInvoiceDate(invoice);
    const invoiceTotal = Number(invoice.TOTAL || 0);
    if (!isFacInvoice(invoice) || isOfficialSeller(invoice) || !issueDate || issueDate < from || issueDate > to || !Number.isFinite(invoiceTotal)) {
      return;
    }

    total += invoiceTotal;
    count += 1;

    const companyName = normalizeCompanyName(COMPANY_NAME_BY_ID[String(invoice._companyId || '')] || invoice._companyLabel || '');
    const sellerCode = normalizeCode(invoice.COD_VENDEDOR);
    const advisorId = advisorCodeIndex.get(`${companyName}|${sellerCode}`);
    if (advisorId) {
      if (!byAdvisor[advisorId]) byAdvisor[advisorId] = { total: 0, count: 0 };
      byAdvisor[advisorId].total += invoiceTotal;
      byAdvisor[advisorId].count += 1;
    }
  });

  return { total, count, byAdvisor };
}
