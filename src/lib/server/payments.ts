import { FieldValue } from 'firebase-admin/firestore';
import { differenceInCalendarDays, parse, parseISO } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/clients';
import { type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
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

const PENDING_STATUSES: PaymentStatus[] = ['Pendiente', 'Reclamado', 'Incobrable'];

export type PaymentImportRow = Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>;

export class PaymentApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

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

export async function listPaymentsServer(options: { pending?: boolean }) {
  const collectionRef = dbAdmin.collection('payment_entries');
  const snapshot = options.pending
    ? await collectionRef.where('status', 'in', PENDING_STATUSES).orderBy('createdAt', 'desc').get()
    : await collectionRef.orderBy('createdAt', 'desc').get();

  return snapshot.docs.map(doc => mapPaymentEntry(doc.id, doc.data()));
}

export async function importPaymentsServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const advisorId = typeof body.advisorId === 'string' ? body.advisorId : '';
  const advisorName = typeof body.advisorName === 'string' ? body.advisorName : '';
  const rows = Array.isArray(body.rows) ? (body.rows as PaymentImportRow[]) : [];

  if (!advisorId || !advisorName) {
    throw new PaymentApiError('Asesor obligatorio para importar pagos.', 400);
  }

  const existingSnap = await dbAdmin.collection('payment_entries').where('advisorId', '==', advisorId).get();
  const existingEntries = existingSnap.docs.map(docSnap => {
    const data = docSnap.data();
    const comprobanteNumber = typeof data.comprobanteNumber === 'string' ? data.comprobanteNumber.trim() : '';

    return {
      ref: docSnap.ref,
      comprobanteNumber: comprobanteNumber || null,
    };
  });

  const existingMap = existingEntries.reduce((acc, entry) => {
    if (entry.comprobanteNumber) acc.set(entry.comprobanteNumber, entry.ref);
    return acc;
  }, new Map<string, FirebaseFirestore.DocumentReference>());

  const existingNumbers = new Set(
    existingEntries.map(entry => entry.comprobanteNumber).filter((value): value is string => Boolean(value)),
  );

  const incomingNumbers = new Set(
    rows.map(row => (row.comprobanteNumber || '').trim()).filter(Boolean),
  );

  const batch = dbAdmin.batch();
  existingEntries
    .filter(entry => entry.comprobanteNumber && !incomingNumbers.has(entry.comprobanteNumber))
    .forEach(entry => batch.delete(entry.ref));

  rows.forEach(row => {
    const comprobante = (row.comprobanteNumber || '').trim();
    const payload = {
      ...buildPaymentImportPayload(row, advisorId, advisorName),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (comprobante && existingMap.has(comprobante)) {
      batch.update(existingMap.get(comprobante)!, payload);
    } else if (!comprobante || !existingNumbers.has(comprobante)) {
      const docRef = dbAdmin.collection('payment_entries').doc();
      batch.set(docRef, {
        ...payload,
        status: 'Pendiente' as PaymentStatus,
        notes: row.notes || '',
        nextContactAt: row.nextContactAt || null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await batch.commit();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    ownerName: advisorName,
    type: 'update',
    entityType: 'invoice',
    entityId: advisorId,
    entityName: 'Pagos',
    details: `actualizo la lista de pagos del asesor ${advisorName}`,
  });
}

export async function deletePaymentsServer(rawBody: unknown) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const paymentIds = Array.isArray(body.paymentIds)
    ? body.paymentIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
    : [];

  if (paymentIds.length === 0) return;

  const batch = dbAdmin.batch();
  paymentIds.forEach(id => {
    batch.delete(dbAdmin.collection('payment_entries').doc(id));
  });
  await batch.commit();
}

type PaymentAudit = {
  ownerName?: string;
  details?: string;
};

export async function updatePaymentServer(paymentId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const updates = (body.updates || {}) as Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>;
  const audit = (body.audit || {}) as PaymentAudit;
  const shouldAudit = Boolean(body.audit && typeof body.audit === 'object');

  await dbAdmin.collection('payment_entries').doc(paymentId).update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (shouldAudit) {
    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      ownerName: audit.ownerName,
      type: 'update',
      entityType: 'payment',
      entityId: paymentId,
      entityName: 'Mora',
      details: audit.details || 'Actualizo un registro de mora',
    });
  }
}

export async function requestPaymentExplanationServer(paymentId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const advisorName = typeof body.advisorName === 'string' ? body.advisorName : undefined;
  const note = typeof body.note === 'string' ? body.note : '';
  const comprobanteNumber = typeof body.comprobanteNumber === 'string' ? body.comprobanteNumber : null;
  const requesterName = getRequesterName(requester);

  await dbAdmin.collection('payment_entries').doc(paymentId).update({
    lastExplanationRequestAt: FieldValue.serverTimestamp(),
    lastExplanationRequestById: requester.uid,
    lastExplanationRequestByName: requesterName,
    explanationRequestNote: note || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    ownerName: advisorName,
    type: 'comment',
    entityType: 'payment',
    entityId: paymentId,
    entityName: comprobanteNumber ? `Comprobante ${comprobanteNumber}` : 'Mora',
    details: note ? `Solicito aclaracion (${note})` : 'Solicito aclaracion al asesor sobre el registro de mora.',
  });
}
