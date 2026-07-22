import { NextResponse } from 'next/server';
import { ConvenioApiError } from '@/lib/server/convenios';

type ConvenioErrorContext = {
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

export function convenioErrorResponse(error: unknown, context: ConvenioErrorContext) {
  if (error instanceof ConvenioApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = getErrorMessage(error);
  console.error(`CONVENIO ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: 502 });
}
