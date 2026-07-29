import type { User } from 'firebase/auth';
import { env, requireEnv } from '../config/env';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  user: User;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildUrl(path: string) {
  const baseUrl = requireEnv(env.apiBaseUrl, 'EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readPayload(response: Response) {
  return response.json().catch(() => null);
}

async function sendRequest(path: string, options: ApiRequestOptions, forceRefresh: boolean) {
  const { body, user, headers, ...init } = options;
  const token = await user.getIdToken(forceRefresh);
  const requestHeaders = new Headers(headers);

  requestHeaders.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  return fetch(buildUrl(path), {
    ...init,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  let response = await sendRequest(path, options, false);
  let payload = await readPayload(response);

  if (response.status === 401) {
    response = await sendRequest(path, options, true);
    payload = await readPayload(response);
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : 'La API no pudo completar la solicitud.';
    throw new ApiError(message, response.status, payload);
  }

  if (payload == null) {
    throw new ApiError('La API devolvio una respuesta vacia.', response.status, payload);
  }

  return payload as T;
}
