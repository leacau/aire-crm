import { NextResponse } from 'next/server';
import { getBearerToken, type ServerUser } from '@/lib/server/auth';
import { AuthSessionApiError, validateAuthSessionServer } from '@/lib/server/auth-session';
import { logRouteError, routeApiErrorResponse } from '@/lib/server/route-errors';

export type MobileSession = Awaited<ReturnType<typeof validateAuthSessionServer>>;

export type MobileSessionContext = {
  requester: ServerUser;
  session: MobileSession;
};

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function buildRequesterFromSession(session: MobileSession): ServerUser {
  const sessionUser = session.user as Record<string, unknown>;

  return {
    uid: String(sessionUser.id || ''),
    email: asOptionalString(sessionUser.email),
    name: asOptionalString(sessionUser.name),
    role: asOptionalString(sessionUser.role),
    area: asOptionalString(sessionUser.area),
    permissions: sessionUser.permissions && typeof sessionUser.permissions === 'object'
      ? sessionUser.permissions as ServerUser['permissions']
      : {},
    sellerConfig: Array.isArray(sessionUser.sellerConfig)
      ? sessionUser.sellerConfig as ServerUser['sellerConfig']
      : [],
  };
}

export async function requireMobileSession(request: Request): Promise<MobileSessionContext | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  try {
    const session = await validateAuthSessionServer(token);
    const requester = buildRequesterFromSession(session);
    if (!requester.uid) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    return { requester, session };
  } catch (error) {
    if (error instanceof AuthSessionApiError) {
      return routeApiErrorResponse(error);
    }

    const { message } = logRouteError(error, 'MOBILE AUTH', { action: 'SESSION' });
    return NextResponse.json({
      error: 'No se pudo validar la sesion.',
      details: message,
    }, { status: 502 });
  }
}

export function isMobileSessionResponse(value: MobileSessionContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
