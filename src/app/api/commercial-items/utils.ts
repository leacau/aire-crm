import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { serializeDocument } from '@/lib/server/firestore';
import type { CommercialItem } from '@/lib/types';

export function normalizeCommercialDate(value: unknown): string {
  if (typeof value === 'string') {
    const candidate = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : 'invalid-date';
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return 'invalid-date';
}

export function mapCommercialItem(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): CommercialItem {
  const item = serializeDocument<CommercialItem>(id, data);
  return {
    ...item,
    date: normalizeCommercialDate(data?.date ?? item.date),
  };
}

export function cleanCommercialItemPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

  delete (cleaned as Record<string, unknown>).id;
  delete (cleaned as Record<string, unknown>).date;

  return cleaned;
}

export function sanitizeCommercialRelations<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const cleaned = { ...cleanCommercialItemPayload(payload) } as Record<string, unknown>;

  if (!cleaned.clientId) {
    delete cleaned.clientId;
    delete cleaned.clientName;
  }

  if (!cleaned.opportunityId) {
    delete cleaned.opportunityId;
    delete cleaned.opportunityTitle;
  }

  return cleaned as Partial<T>;
}

export function prepareCommercialItemUpdate(payload: Record<string, unknown>) {
  const cleaned = { ...cleanCommercialItemPayload(payload) } as Record<string, unknown>;

  if (!cleaned.clientId) {
    cleaned.clientId = FieldValue.delete();
    cleaned.clientName = FieldValue.delete();
  }

  if (!cleaned.opportunityId) {
    cleaned.opportunityId = FieldValue.delete();
    cleaned.opportunityTitle = FieldValue.delete();
  }

  if (cleaned.pntReadAt === undefined) {
    cleaned.pntReadAt = FieldValue.delete();
  }

  return cleaned;
}
