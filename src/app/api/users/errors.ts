import { NextResponse } from 'next/server';
import {
  getRouteErrorStatus,
  logRouteError,
  routeApiErrorResponse,
  type RouteErrorContext,
} from '@/lib/server/route-errors';
import { UserApiError } from '@/lib/server/users';

type UserErrorContext = RouteErrorContext;

export function userErrorResponse(error: unknown, context: UserErrorContext) {
  if (error instanceof UserApiError) {
    return routeApiErrorResponse(error);
  }

  const { message } = logRouteError(error, 'USERS', context);
  const status = getRouteErrorStatus(error, undefined, null);

  if (status && Number.isFinite(status)) {
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    error: context.publicError,
    details: message,
  }, { status: context.status || 502 });
}
