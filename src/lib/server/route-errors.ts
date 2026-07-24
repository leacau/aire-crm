import { NextResponse } from 'next/server';

export type RouteErrorContext = {
  action: string;
  requesterId?: string;
  publicError: string;
  status?: number;
};

export function getRouteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

export function getRouteErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

export function getRouteErrorStatus(error: unknown, fallbackStatus?: number, defaultStatus: number | null = 502) {
  if (fallbackStatus) return fallbackStatus;
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status) || defaultStatus
    : defaultStatus;
}

export function routeApiErrorResponse(error: Error & { status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export function logRouteError(error: unknown, label: string, context: Pick<RouteErrorContext, 'action' | 'requesterId'>) {
  const message = getRouteErrorMessage(error);
  const code = getRouteErrorCode(error);

  console.error(`${label} ${context.action} ERROR:`, {
    requester: context.requesterId,
    code,
    message,
  });

  return { code, message };
}

export function routeErrorResponse(
  error: unknown,
  label: string,
  context: RouteErrorContext,
  options: { exposeClientError?: boolean; includeCode?: boolean } = {},
) {
  const status = getRouteErrorStatus(error, context.status) ?? 502;
  const { code, message } = logRouteError(error, label, context);
  const responseBody: { error: string; code?: string; details: string } = {
    error: options.exposeClientError && status < 500 ? message : context.publicError,
    details: message,
  };

  if (options.includeCode) {
    responseBody.code = code;
  }

  return NextResponse.json(responseBody, { status });
}
