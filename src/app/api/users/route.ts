import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createUserProfileServer, listUsersServer } from '@/lib/server/users';
import { userErrorResponse } from '@/app/api/users/errors';
import type { UserRole } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as UserRole | null;
    const users = await listUsersServer(role);
    return NextResponse.json({ users });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los usuarios.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await createUserProfileServer(body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el usuario.',
    });
  }
}
