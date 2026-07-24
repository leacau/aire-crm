import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/requester';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import {
  canAccessInvoiceMutation,
  canAccessInvoiceMutationByOpportunity,
  filterAccessibleInvoices,
} from '@/lib/server/invoice-access';
import type { Invoice } from '@/lib/types';

export class InvoiceApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

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

export function cleanInvoicePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
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

export async function listInvoicesServer(options: {
  opportunityId?: string | null;
  dashboard?: boolean;
  requester: ServerUser;
}) {
  const collectionRef = dbAdmin.collection('invoices');
  let snapshot: FirebaseFirestore.QuerySnapshot;

  if (options.opportunityId) {
    snapshot = await collectionRef.where('opportunityId', '==', options.opportunityId).get();
  } else if (options.dashboard) {
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    snapshot = await collectionRef
      .where('dateGenerated', '>=', thirteenMonthsAgo.toISOString())
      .orderBy('dateGenerated', 'desc')
      .get();
  } else {
    snapshot = await collectionRef.orderBy('dateGenerated', 'desc').get();
  }

  const invoices = snapshot.docs
    .map(doc => mapInvoice(doc.id, doc.data()))
    .sort(compareInvoicesByGeneratedDesc);

  return filterAccessibleInvoices(invoices, options.requester);
}

export async function createInvoiceServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const invoiceData = body.invoiceData as Omit<Invoice, 'id'> | undefined;

  if (!invoiceData?.invoiceNumber || !invoiceData.opportunityId) {
    throw new InvoiceApiError('Numero de factura y oportunidad son obligatorios.', 400);
  }

  if (!(await canAccessInvoiceMutationByOpportunity(invoiceData.opportunityId, requester))) {
    throw new InvoiceApiError('Forbidden', 403);
  }

  const docRef = await dbAdmin.collection('invoices').add(buildInvoiceCreatePayload(invoiceData));

  if (invoiceData.date && !invoiceData.isCreditNote) {
    const monthKey = invoiceData.date.substring(0, 7);
    const amountToLog = Math.abs(normalizeInvoiceAmount(invoiceData.amount));
    const increment = buildMonthlyBillingIncrement(monthKey, amountToLog, requester.uid);
    await dbAdmin.collection('estadisticas_mensuales').doc(increment.monthKey).set(increment.data, { merge: true });
  }

  return docRef.id;
}

export async function updateInvoiceServer(invoiceId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const data = (body.data || {}) as Partial<Omit<Invoice, 'id'>>;
  const docRef = dbAdmin.collection('invoices').doc(invoiceId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new InvoiceApiError('Factura no encontrada', 404);
  }

  const invoice = mapInvoice(snap.id, snap.data());
  const targetOpportunityId = data.opportunityId || invoice.opportunityId;
  if (!(await canAccessInvoiceMutationByOpportunity(targetOpportunityId, requester))) {
    throw new InvoiceApiError('Forbidden', 403);
  }

  if (data.opportunityId !== undefined && data.opportunityId !== invoice.opportunityId && !hasServerManagementPrivileges(requester)) {
    throw new InvoiceApiError('Forbidden', 403);
  }

  await docRef.update(buildInvoiceUpdatePayload(data));
}

export async function deleteInvoiceServer(invoiceId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const ownerName = typeof body.ownerName === 'string' ? body.ownerName : 'Cliente';
  const docRef = dbAdmin.collection('invoices').doc(invoiceId);
  const snap = await docRef.get();

  if (!snap.exists) return;

  const invoice = mapInvoice(snap.id, snap.data());
  if (!hasServerManagementPrivileges(requester) && !(await canAccessInvoiceMutation(invoice, requester))) {
    throw new InvoiceApiError('Forbidden', 403);
  }

  const invoiceData = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'invoice',
    entityId: invoiceId,
    entityName: `Factura #${invoiceData.invoiceNumber || invoiceId}`,
    details: `elimino la factura #${invoiceData.invoiceNumber || invoiceId}`,
    ownerName,
  });
}
