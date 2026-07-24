import { NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/server/auth';
import { AuthSessionApiError, validateAuthSessionServer } from '@/lib/server/auth-session';
import { logRouteError, routeApiErrorResponse } from '@/lib/server/route-errors';

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  try {
    const session = await validateAuthSessionServer(token);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof AuthSessionApiError) {
      return routeApiErrorResponse(error);
    }

    const { message } = logRouteError(error, 'AUTH SESSION', { action: 'ROUTE' });

    return NextResponse.json({
      error: 'No se pudo validar la sesion.',
      details: message,
    }, { status: 502 });
  }
}
