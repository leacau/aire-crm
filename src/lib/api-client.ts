'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  user?: FirebaseUser | null;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, user, headers, ...init } = options;
  const currentUser = user ?? auth.currentUser;
  const token = await currentUser?.getIdToken();

  if (!token) {
    throw new Error('No hay sesion activa.');
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || 'La API no pudo completar la solicitud.');
  }

  return payload as T;
}

