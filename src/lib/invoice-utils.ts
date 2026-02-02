import { parseISO } from 'date-fns';
import type { Invoice } from './types';

export const sanitizeInvoiceNumber = (value: string): string => {
  return (value || '').replace(/\D+/g, '');
};

const safeParseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Fecha de factura inválida encontrada', value, error);
    }
    return null;
  }
};

export const getManualInvoiceDate = (invoice: Invoice): Date | null => {
  return safeParseDate(invoice.date);
};

export const getPaidInvoiceDate = (invoice: Invoice): Date | null => {
  return safeParseDate(invoice.datePaid);
};

export const getNormalizedInvoiceNumber = (invoice: Pick<Invoice, 'invoiceNumber'>): string => {
  const digitChunks = String(invoice.invoiceNumber || '').match(/\d+/g);
  if (!digitChunks) return '';

  const numericOnly = digitChunks.join('');
  const shouldStripLeadingZeros = numericOnly.length >= 5;
  const withoutLeadingZeros = shouldStripLeadingZeros ? numericOnly.replace(/^0+/, '') : numericOnly;

  /**
   * Ejemplos de normalización esperada:
   * - "FAC-000123-A" => "123"
   * - "inv 045/2024" => "452024"
   * - "000987" => "987"
   * - "A-B-C" => ""
   */
  return withoutLeadingZeros || '0';
};
