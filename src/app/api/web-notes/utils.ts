import { serializeDocument } from '@/lib/server/firestore';
import type { WebNote } from '@/lib/types';

export function mapWebNote(id: string, data: FirebaseFirestore.DocumentData | undefined): WebNote {
  return serializeDocument<WebNote>(id, data);
}

export function compareWebNotesByCreatedAtDesc(a: WebNote, b: WebNote) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanWebNotePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}
