import { NextResponse } from 'next/server';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

export function cronErrorResponse(error: unknown, jobName: string) {
  const message = getErrorMessage(error);
  console.error(`CRON ${jobName} ERROR:`, {
    code: getErrorCode(error),
    message,
  });

  return NextResponse.json({
    success: false,
    error: 'No se pudo completar la tarea programada.',
    details: message,
  }, { status: 502 });
}
