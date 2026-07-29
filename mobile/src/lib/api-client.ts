import type { User } from 'firebase/auth';
import { env, requireEnv } from '../config/env';

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  user: User;
};

type ParsedResponse = {
  contentType: string;
  payload: unknown;
  text: string;
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
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text().catch(() => '');
  if (!text) return { contentType, payload: null, text };

  if (contentType.includes('application/json')) {
    try {
      return { contentType, payload: JSON.parse(text), text };
    } catch {
      return { contentType, payload: null, text };
    }
  }

  return { contentType, payload: null, text };
}

function getApiErrorMessage(response: Response, parsed: ParsedResponse) {
  const { payload, text, contentType } = parsed;

  if (typeof payload === 'object' && payload && 'error' in payload) {
    return String((payload as { error?: unknown }).error);
  }

  const location = response.headers.get('location') || '';
  const preview = text.trim().slice(0, 120);
  if (
    response.status >= 300
    && response.status < 400
    && (location.includes('vercel.com/sso-api') || preview.includes('Redirecting'))
  ) {
    return 'La URL de API apunta a un deploy protegido por Vercel SSO. Usá la URL pública de producción o quitá la protección del deploy para endpoints API.';
  }

  if (contentType && !contentType.includes('application/json')) {
    return `La API no devolvio JSON (${contentType}). Verifica EXPO_PUBLIC_API_BASE_URL.`;
  }

  return 'La API no pudo completar la solicitud.';
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
    redirect: 'manual',
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  let response = await sendRequest(path, options, false);
  let parsed = await readPayload(response);

  if (response.status === 401) {
    response = await sendRequest(path, options, true);
    parsed = await readPayload(response);
  }

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(response, parsed), response.status, parsed.payload);
  }

  if (parsed.payload == null) {
    throw new ApiError(getApiErrorMessage(response, parsed), response.status, parsed.payload);
  }

  return parsed.payload as T;
}
