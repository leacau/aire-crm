import { NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/server/auth';
import { AuthSessionApiError, validateAuthSessionServer } from '@/lib/server/auth-session';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

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
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = getErrorMessage(error);
    console.error('AUTH SESSION ROUTE ERROR:', {
      code: getErrorCode(error),
      message,
    });

    return NextResponse.json({
      error: 'No se pudo validar la sesion.',
      details: message,
    }, { status: 502 });
  }
}
