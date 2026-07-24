import { NextResponse } from 'next/server';

type TangoErrorContext = {
  action: string;
  requesterId?: string;
  publicError: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

function getErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : null;
}

export function tangoMissingConfigResponse(variableName: string) {
  return NextResponse.json({
    error: `Falta configurar ${variableName}`,
  }, { status: 503 });
}

export function tangoErrorResponse(error: unknown, context: TangoErrorContext) {
  const message = getErrorMessage(error);
  const isConfigError = message.startsWith('Falta configurar TANGO_')
    || message.startsWith('TANGO_API_BASE_URL no es una URL valida');

  console.error(`TANGO ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  const status = getErrorStatus(error);
  if (status && Number.isFinite(status)) {
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: isConfigError ? 503 : 502 });
}
