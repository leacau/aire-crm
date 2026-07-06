import { Timestamp } from 'firebase-admin/firestore';

export function serializeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeFirestoreValue(nestedValue)]),
    );
  }

  return value;
}

export function serializeDocument<T>(id: string, data: FirebaseFirestore.DocumentData | undefined): T {
  return {
    id,
    ...(serializeFirestoreValue(data || {}) as Record<string, unknown>),
  } as T;
}

