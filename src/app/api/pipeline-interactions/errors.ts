import { NextResponse } from 'next/server';

type PipelineInteractionErrorContext = {
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

function getErrorStatus(error: unknown, fallbackStatus?: number) {
  if (fallbackStatus) return fallbackStatus;
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status) || 502
    : 502;
}

export function pipelineInteractionErrorResponse(error: unknown, context: PipelineInteractionErrorContext) {
  const message = getErrorMessage(error);
  console.error(`PIPELINE INTERACTIONS ${context.action} ERROR:`, {
    requester: context.requesterId,
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: getErrorStatus(error, context.status) });
}
