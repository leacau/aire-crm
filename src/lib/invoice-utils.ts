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
  return sanitizeInvoiceNumber(invoice.invoiceNumber);
};
