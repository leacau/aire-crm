import { differenceInCalendarDays, parse, parseISO } from 'date-fns';
import { serializeDocument } from '@/lib/server/firestore';
import type { PaymentEntry, PaymentStatus } from '@/lib/types';

const PAYMENT_DATE_FORMATS = [
  'yyyy-MM-dd',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'dd/MM/yy',
  'd/M/yy',
  'dd-MM-yy',
  'd-M-yy',
];

export type PaymentImportRow = Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>;

export function parsePaymentDate(raw?: string | null) {
  if (!raw) return null;
  const value = raw.toString().trim();

  const tryParse = (parser: () => Date) => {
    try {
      const parsed = parser();
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch {
      return null;
    }
    return null;
  };

  return (
    tryParse(() => parseISO(value)) ??
    PAYMENT_DATE_FORMATS.reduce<Date | null>(
      (acc, formatString) => acc ?? tryParse(() => parse(value, formatString, new Date())),
      null,
    )
  );
}

export function normalizePaymentDate(raw?: string | null) {
  const parsed = parsePaymentDate(raw);
  if (parsed) return parsed.toISOString();
  return raw ? raw.toString().trim() : null;
}

export function computeDaysLate(dueDate?: string | null) {
  const parsed = parsePaymentDate(dueDate);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;

  const diff = differenceInCalendarDays(new Date(), parsed);
  return diff > 0 ? diff : 0;
}

export function mapPaymentEntry(id: string, data: FirebaseFirestore.DocumentData | undefined): PaymentEntry {
  const payment = serializeDocument<PaymentEntry>(id, data);
  return {
    ...payment,
    amount: typeof payment.amount === 'number' ? payment.amount : Number(payment.amount) || undefined,
    pendingAmount:
      typeof payment.pendingAmount === 'number' ? payment.pendingAmount : Number(payment.pendingAmount) || undefined,
    daysLate: computeDaysLate(payment.dueDate),
    status: (payment.status as PaymentStatus) || 'Pendiente',
    nextContactAt: payment.nextContactAt || null,
    createdAt: payment.createdAt || new Date().toISOString(),
  };
}

export function buildPaymentImportPayload(row: PaymentImportRow, advisorId: string, advisorName: string) {
  const normalizedIssueDate = normalizePaymentDate(row.issueDate);
  const normalizedDueDate = normalizePaymentDate(row.dueDate);

  return {
    advisorId,
    advisorName,
    company: row.company,
    tipo: row.tipo || null,
    comprobanteNumber: row.comprobanteNumber,
    razonSocial: row.razonSocial,
    amount: row.amount ?? null,
    pendingAmount: row.pendingAmount ?? null,
    issueDate: normalizedIssueDate,
    dueDate: normalizedDueDate,
    daysLate: computeDaysLate(normalizedDueDate),
  };
}
