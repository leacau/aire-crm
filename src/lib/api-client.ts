'use client';

import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  user?: FirebaseUser | null;
};

type ApiFetchOptions = RequestInit & {
  user?: FirebaseUser | null;
};

const AUTH_READY_TIMEOUT_MS = 5000;

let authReadyPromise: Promise<FirebaseUser | null> | null = null;

function waitForAuthUser(): Promise<FirebaseUser | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = new Promise<FirebaseUser | null>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let timeoutId: number | undefined;

    const finish = (user: FirebaseUser | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
      resolve(user);
    };

    timeoutId = window.setTimeout(() => finish(auth.currentUser), AUTH_READY_TIMEOUT_MS);
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => finish(user),
      () => finish(auth.currentUser),
    );
  }).finally(() => {
    authReadyPromise = null;
  });

  return authReadyPromise;
}

async function getToken(user: FirebaseUser | null | undefined, forceRefresh: boolean) {
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
    throw new Error(payload?.error || 'La API no pudo completar la solicitud.');
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
