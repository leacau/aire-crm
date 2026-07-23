import { NextResponse } from 'next/server';

type WebNoteErrorContext = {
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
    ? Number((error as { status?: unknown }).status) || 502
    : 502;
}

export function webNoteErrorResponse(error: unknown, context: WebNoteErrorContext) {
  const message = getErrorMessage(error);
  const status = getErrorStatus(error);
  console.error(`WEB NOTES ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    error: status < 500 ? message : context.publicError,
    details: message,
  }, { status });
}
