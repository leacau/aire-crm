import { NextResponse } from 'next/server';
import { ApprovalApiError } from '@/lib/server/approvals';

type ApprovalErrorContext = {
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

export function approvalErrorResponse(error: unknown, context: ApprovalErrorContext) {
  if (error instanceof ApprovalApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = getErrorMessage(error);
  console.error(`APPROVALS ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: 502 });
}
