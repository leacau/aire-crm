import { differenceInCalendarDays, parse, parseISO } from 'date-fns';
import type { PaymentEntry } from './types';

const PAYMENT_DATE_FORMATS = [
  { format: 'yyyy-MM-dd', pattern: /^\d{4}-\d{1,2}-\d{1,2}$/ },
  { format: 'dd/MM/yyyy', pattern: /^\d{2}\/\d{2}\/\d{4}$/ },
  { format: 'd/M/yyyy', pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/ },
  { format: 'dd-MM-yyyy', pattern: /^\d{2}-\d{2}-\d{4}$/ },
  { format: 'd-M-yyyy', pattern: /^\d{1,2}-\d{1,2}-\d{4}$/ },
  { format: 'dd/MM/yy', pattern: /^\d{2}\/\d{2}\/\d{2}$/ },
  { format: 'd/M/yy', pattern: /^\d{1,2}\/\d{1,2}\/\d{2}$/ },
  { format: 'dd-MM-yy', pattern: /^\d{2}-\d{2}-\d{2}$/ },
  { format: 'd-M-yy', pattern: /^\d{1,2}-\d{1,2}-\d{2}$/ },
];

export const getPeriodDurationInMonths = (period: string): number => {
  switch (period) {
    case 'Mensual': return 1;
    case 'Trimestral': return 3;
    case 'Semestral': return 6;
    case 'Anual': return 12;
    default: return 0;
  }
};

export const parseFlexibleDate = (raw?: string | null) => {
  if (!raw) return null;
  const value = raw.toString().trim();

  const tryParse = (parser: () => Date) => {
    try {
      const parsed = parser();
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch (error) {
      return null;
    }
    return null;
  };

  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? tryParse(() => parseISO(value)) : null;
  return isoDate ?? PAYMENT_DATE_FORMATS.reduce<Date | null>(
    (acc, candidate) => acc ?? (candidate.pattern.test(value) ? tryParse(() => parse(value, candidate.format, new Date())) : null),
    null,
  );
};

export const normalizeDate = (raw?: string) => {
  const parsed = parseFlexibleDate(raw);
  if (parsed) return parsed.toISOString();
  return raw ? String(raw).trim() : undefined;
};

export const normalizeDateKey = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().split('T')[0];
  if (raw && typeof raw === 'object' && typeof (raw as any).toDate === 'function') {
    const parsedTimestamp = (raw as any).toDate();
    if (parsedTimestamp instanceof Date && !Number.isNaN(parsedTimestamp.getTime())) {
      return parsedTimestamp.toISOString().split('T')[0];
    }
  }
  const parsed = parseFlexibleDate(raw == null ? null : String(raw));
  if (parsed) return parsed.toISOString().split('T')[0];
  const value = raw == null ? '' : String(raw).trim();
  return value ? value.split('T')[0] : '';
};

export const normalizeDateForComparison = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (raw && typeof raw === 'object' && typeof (raw as any).toDate === 'function') {
    const parsedTimestamp = (raw as any).toDate();
    if (parsedTimestamp instanceof Date && !Number.isNaN(parsedTimestamp.getTime())) return parsedTimestamp;
  }
  return parseFlexibleDate(raw == null ? null : String(raw));
};

export const isOfficialSellerName = (value?: string | null) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('oficial')
);

export const computeDaysLate = (dueDate?: string) => {
  const parsedDate = parseFlexibleDate(dueDate);
  if (!parsedDate) return null;
  const diff = differenceInCalendarDays(new Date(), parsedDate);
  return diff > 0 ? diff : 0;
};

export const parsePastedPayments = (
  raw: string,
): Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[] => {
  const parseAmount = (value?: string) => {
    if (!value) return undefined;
    const cleaned = String(value).replace(/[^0-9.,-]/g, '');
    const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    const numeric = parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cols) => cols.length >= 7)
    .map((cols) => {
      const [company, , comprobante, razonSocial, pendingRaw, issueDateRaw, dueDateRaw] = cols;
      const pendingAmount = parseAmount(pendingRaw);
      const dueDate = normalizeDate(dueDateRaw);
      const issueDate = normalizeDate(issueDateRaw);

      return {
        company: company || '-',
        comprobanteNumber: comprobante || undefined,
        razonSocial: razonSocial || undefined,
        pendingAmount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        amount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        issueDate,
        dueDate,
        daysLate: computeDaysLate(dueDate || undefined) ?? undefined,
        notes: '',
        nextContactAt: null,
      };
    });
};
