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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new ApiClientError(401, 'Tu sesión no está disponible. Vuelve a iniciar sesión.', 'AUTH_REQUIRED');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
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
