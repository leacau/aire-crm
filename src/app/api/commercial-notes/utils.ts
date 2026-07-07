import { serializeDocument } from '@/lib/server/firestore';
import type { CommercialNote } from '@/lib/types';

export function mapCommercialNote(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): CommercialNote {
  return serializeDocument<CommercialNote>(id, data);
}

export function compareCommercialNotesByCreatedAtDesc(a: CommercialNote, b: CommercialNote) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanCommercialNotePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}
