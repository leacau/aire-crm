'use client';

import { auth } from '@/lib/firebase';

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error?: string;
  code?: string;
};

const DEFAULT_READ_CIRCUIT_TTL_MS = 2 * 60 * 1000;
const readCircuitOpenUntil = new Map<string, number>();

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

export function isRecoverableReadApiError(
  error: unknown,
  options: { fallbackOnForbidden?: boolean } = {},
): boolean {
  if (!(error instanceof ApiClientError)) return false;
  return (
    (options.fallbackOnForbidden === true && error.status === 403) ||
    error.status >= 500 ||
    error.code === 'FIRESTORE_UNAVAILABLE' ||
    error.code === 'FIRESTORE_INDEX_REQUIRED' ||
    error.code === 'INTERNAL_ERROR'
  );
}

function getReadCircuitKey(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    return url.pathname;
  } catch {
    return path.split('?')[0] || path;
  }
}

function isReadCircuitOpen(key: string): boolean {
  const openUntil = readCircuitOpenUntil.get(key) || 0;
  if (openUntil <= Date.now()) {
    readCircuitOpenUntil.delete(key);
    return false;
  }
  return true;
}

function openReadCircuit(key: string, ttlMs: number): void {
  readCircuitOpenUntil.set(key, Date.now() + ttlMs);
}

export function resetApiReadCircuit(path?: string): void {
  if (!path) {
    readCircuitOpenUntil.clear();
    return;
  }
  readCircuitOpenUntil.delete(getReadCircuitKey(path));
}

export async function apiReadWithFallback<T>(
  path: string,
  fallback: () => Promise<T>,
  options: { circuitKey?: string; circuitTtlMs?: number; fallbackOnForbidden?: boolean; label?: string } = {},
): Promise<T> {
  const circuitKey = options.circuitKey || getReadCircuitKey(path);
  const label = options.label || circuitKey;
  if (isReadCircuitOpen(circuitKey)) {
    console.warn(`Skipping API read for ${label}; using fallback while circuit is open.`);
    return fallback();
  }

  try {
    return await apiRequest<T>(path);
  } catch (error) {
    if (!isRecoverableReadApiError(error, { fallbackOnForbidden: options.fallbackOnForbidden })) throw error;
    openReadCircuit(circuitKey, options.circuitTtlMs ?? DEFAULT_READ_CIRCUIT_TTL_MS);
    console.warn(`Falling back to Firestore client read for ${label}:`, error);
    return fallback();
  }
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
