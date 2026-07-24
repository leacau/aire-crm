import { NextResponse } from 'next/server';
import { getRouteErrorCode, logRouteError, type RouteErrorContext } from '@/lib/server/route-errors';

type ServiceErrorContext = RouteErrorContext & {
  service: string;
};

export function externalServiceErrorResponse(error: unknown, context: ServiceErrorContext) {
  const code = getRouteErrorCode(error);
  const { message } = logRouteError(error, context.service, context);

  return NextResponse.json({
    error: context.publicError,
    code,
    details: message,
  }, { status: context.status || 502 });
}
