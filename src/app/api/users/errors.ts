import { NextResponse } from 'next/server';
import { UserApiError } from '@/lib/server/users';

type UserErrorContext = {
  action: string;
  requesterId?: string;
  publicError: string;
  status?: number;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

export function userErrorResponse(error: unknown, context: UserErrorContext) {
  if (error instanceof UserApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = getErrorMessage(error);
  console.error(`USERS ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: context.status || 502 });
}
