'use client';

import { auth } from '@/lib/firebase';

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error?: string;
  code?: string;
};

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'API_ERROR',
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function isRecoverableReadApiError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  return (
    error.status >= 500 ||
    error.code === 'FIRESTORE_UNAVAILABLE' ||
    error.code === 'FIRESTORE_INDEX_REQUIRED' ||
    error.code === 'INTERNAL_ERROR'
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentUser = auth.currentUser;
  const token = await currentUser?.getIdToken();
  if (!token) {
    throw new ApiClientError(401, 'Tu sesión no está disponible. Vuelve a iniciar sesión.', 'AUTH_REQUIRED');
  }

  const buildHeaders = (idToken: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${idToken}`);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  let response = await fetch(path, { ...init, headers: buildHeaders(token) });
  if (response.status === 401) {
    const refreshedToken = await currentUser?.getIdToken(true);
    if (refreshedToken) {
      response = await fetch(path, { ...init, headers: buildHeaders(refreshedToken) });
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T> & ApiErrorEnvelope;
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      payload.error || 'No se pudo completar la operación.',
      payload.code,
    );
  }

  return payload.data;
}
