import { NextResponse } from 'next/server';

type ServiceErrorContext = {
  service: string;
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

export function externalServiceErrorResponse(error: unknown, context: ServiceErrorContext) {
  const message = getRouteErrorMessage(error);
  const code = getRouteErrorCode(error);
  console.error(`${context.service} ${context.action} ERROR:`, {
    requester: context.requesterId,
    code,
    message,
  });

  return NextResponse.json({
    error: context.publicError,
    code,
    details: message,
  }, { status: context.status || 502 });
}
