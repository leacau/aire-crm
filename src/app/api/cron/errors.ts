import { NextResponse } from 'next/server';
import { logRouteError } from '@/lib/server/route-errors';

export function cronErrorResponse(error: unknown, jobName: string) {
  const { message } = logRouteError(error, 'CRON', { action: jobName });

  return NextResponse.json({
    success: false,
    error: 'No se pudo completar la tarea programada.',
    details: message,
  }, { status: 502 });
}
