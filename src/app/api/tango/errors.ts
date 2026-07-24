import { NextResponse } from 'next/server';
import {
  getRouteErrorStatus,
  logRouteError,
  type RouteErrorContext,
} from '@/lib/server/route-errors';

type TangoErrorContext = RouteErrorContext;

export function tangoMissingConfigResponse(variableName: string) {
  return NextResponse.json({
    error: `Falta configurar ${variableName}`,
  }, { status: 503 });
}

export function tangoErrorResponse(error: unknown, context: TangoErrorContext) {
  const { message } = logRouteError(error, 'TANGO', context);
  const isConfigError = message.startsWith('Falta configurar TANGO_')
    || message.startsWith('TANGO_API_BASE_URL no es una URL valida');

  const status = getRouteErrorStatus(error, undefined, null);
  if (status && Number.isFinite(status)) {
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: isConfigError ? 503 : 502 });
}
