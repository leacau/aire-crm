'use client';

import {
  getCurrentAuthUser,
  onAuthUserChanged,
  type AuthClientUser,
} from '@/lib/auth-client';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  user?: AuthClientUser | null;
};

type ApiFetchOptions = RequestInit & {
  user?: AuthClientUser | null;
};

const AUTH_READY_TIMEOUT_MS = 5000;

let authReadyPromise: Promise<AuthClientUser | null> | null = null;

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function waitForAuthUser(): Promise<AuthClientUser | null> {
  const currentUser = getCurrentAuthUser();
  if (currentUser) {
    return Promise.resolve(currentUser);
  }

  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = new Promise<AuthClientUser | null>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timeoutId: number | undefined;

    const finish = (user: AuthClientUser | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
      resolve(user);
    };

    timeoutId = window.setTimeout(() => finish(getCurrentAuthUser()), AUTH_READY_TIMEOUT_MS);
    unsubscribe = onAuthUserChanged(
      (user) => finish(user),
      () => finish(getCurrentAuthUser()),
    );
  }).finally(() => {
    authReadyPromise = null;
  });

  return authReadyPromise;
}

export function getApiAuthUser(): Promise<AuthClientUser | null> {
  return waitForAuthUser();
}

async function getToken(user: AuthClientUser | null | undefined, forceRefresh: boolean) {
  const currentUser = user ?? (await waitForAuthUser());
  const token = await currentUser?.getIdToken(forceRefresh);
  return token || null;
}

async function readPayload(response: Response) {
  return response.json().catch(() => null);
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, user, headers, ...init } = options;
  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;

  const send = async (forceRefresh: boolean) => {
    const token = await getToken(user, forceRefresh);

    if (!token) {
      throw new Error('No hay sesion activa.');
    }

    const requestHeaders = new Headers(headers);
    if (body !== undefined && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
    requestHeaders.set('Authorization', `Bearer ${token}`);

    return fetch(path, {
      ...init,
      headers: requestHeaders,
      body: requestBody,
    });
  };

  let response = await send(false);
  let payload = await readPayload(response);

  if (response.status === 401) {
    response = await send(true);
    payload = await readPayload(response);
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || 'La API no pudo completar la solicitud.', response.status, payload);
  }

  return payload as T;
}

export async function publicApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new ApiError(payload?.error || 'La API no pudo completar la solicitud.', response.status, payload);
  }

  return payload as T;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { user, headers, ...init } = options;

  const send = async (forceRefresh: boolean) => {
    const token = await getToken(user, forceRefresh);

    if (!token) {
      throw new Error('No hay sesion activa.');
    }

    const requestHeaders = new Headers(headers);
    requestHeaders.set('Authorization', `Bearer ${token}`);

    return fetch(path, {
      ...init,
      headers: requestHeaders,
    });
  };

  const response = await send(false);
  if (response.status !== 401) return response;

  return send(true);
}
