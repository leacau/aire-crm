import { FieldValue } from 'firebase-admin/firestore';
import { serializeDocument } from '@/lib/server/firestore';
import type { Invoice } from '@/lib/types';

export function normalizeInvoiceAmount(rawAmount: unknown): number {
  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
    return rawAmount;
  }

  if (typeof rawAmount === 'string') {
    const sanitized = rawAmount.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const fallback = Number(rawAmount ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

export function mapInvoice(id: string, data: FirebaseFirestore.DocumentData | undefined): Invoice {
  const invoice = serializeDocument<Invoice>(id, data);
  return {
    ...invoice,
    amount: normalizeInvoiceAmount(invoice.amount),
    isCreditNote: Boolean(invoice.isCreditNote),
    creditNoteMarkedAt: invoice.creditNoteMarkedAt ?? null,
    deletionMarkedAt: invoice.deletionMarkedAt ?? null,
  };
}

export function compareInvoicesByGeneratedDesc(a: Invoice, b: Invoice) {
  return new Date(b.dateGenerated || 0).getTime() - new Date(a.dateGenerated || 0).getTime();
}

export function buildInvoiceCreatePayload(invoiceData: Omit<Invoice, 'id'>) {
  return cleanInvoicePayload({
    ...invoiceData,
    amount: normalizeInvoiceAmount(invoiceData.amount),
    dateGenerated: new Date().toISOString(),
    isCreditNote: invoiceData.isCreditNote ?? false,
    creditNoteMarkedAt: invoiceData.creditNoteMarkedAt ?? null,
    markedForDeletion: invoiceData.markedForDeletion ?? false,
    deletionMarkedAt: invoiceData.deletionMarkedAt ?? null,
    deletionMarkedById: invoiceData.deletionMarkedById ?? null,
    deletionMarkedByName: invoiceData.deletionMarkedByName ?? null,
    periodStart: invoiceData.periodStart ?? null,
    periodEnd: invoiceData.periodEnd ?? null,
    orderDate: invoiceData.orderDate ?? null,
    orderNumber: invoiceData.orderNumber ?? null,
  });
}

export function buildInvoiceUpdatePayload(data: Partial<Omit<Invoice, 'id'>>) {
  const updateData = cleanInvoicePayload({
    ...data,
    ...(data.amount !== undefined ? { amount: normalizeInvoiceAmount(data.amount) } : {}),
  });

  if (updateData.status === 'Pagada' && !updateData.datePaid) {
    updateData.datePaid = new Date().toISOString().split('T')[0];
  }

  return updateData;
}

export function cleanInvoicePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}

export function buildMonthlyBillingIncrement(monthKey: string, amountToAdd: number, advisorId: string) {
  return {
    monthKey,
    data: {
      totalGeneral: FieldValue.increment(amountToAdd),
      [`total_asesor_${advisorId}`]: FieldValue.increment(amountToAdd),
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
}
