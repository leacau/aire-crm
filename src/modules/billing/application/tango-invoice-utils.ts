import type { TangoCompanyId, TangoInvoice } from '../domain/tango-invoice';
import { tangoCompanies } from '../domain/tango-invoice';

export function getTangoCompany(id: string) {
  return tangoCompanies.find(company => company.id === id);
}

export function isTangoCompanyId(value: string): value is TangoCompanyId {
  return Boolean(getTangoCompany(value));
}

export function normalizeTangoText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeTangoCode(value: unknown): string {
  const trimmed = String(value || '').trim();
  const normalized = trimmed.replace(/^0+/, '');
  return normalized || (trimmed ? '0' : '');
}

export function parseTangoTotal(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTangoCurrency(value?: unknown): string {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || value == null) return 'No informado';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function normalizeTangoInvoice(input: Record<string, unknown>): TangoInvoice {
  return {
    ...input,
    TIPO_COMPROBANTE: String(
      input.TIPO_COMPROBANTE
      || input.DESC_TIPO_COMPROBANTE
      || input.COD_TIPO_COMPROBANTE
      || '',
    ) || undefined,
    TOTAL: parseTangoTotal(input.TOTAL),
    COD_CLIENTE: String(input.COD_CLIENTE || input.CODIGO_CLIENTE || input.CLIENTE || ''),
    COD_VENDEDOR: String(input.COD_VENDEDOR || input.COD_VEND || input.VENDEDOR || ''),
    NOMBRE_VENDEDOR: String(input.NOMBRE_VENDEDOR || input.VENDEDOR_NOMBRE || input.NOMBRE_VEND || ''),
  } as TangoInvoice;
}

export function isAdvisorInvoice(invoice: TangoInvoice): boolean {
  const type = String(invoice.TIPO_COMPROBANTE || '').toUpperCase();
  const seller = String(invoice.NOMBRE_VENDEDOR || '').toUpperCase();
  const sellerCode = String(invoice.COD_VENDEDOR || '').toUpperCase();
  const isInvoice = type === 'FAC';
  const isCorporate =
    seller.includes('CORPORATIVO')
    || seller.includes('ALTAMIRANO')
    || seller.includes('MARIO')
    || sellerCode === '020'
    || sellerCode === '021'
    || sellerCode === '022';

  return isInvoice && !isCorporate;
}
