import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { deleteUserServer, getUserServer, updateUserServer } from '@/lib/server/users';
import { userErrorResponse } from '@/app/api/users/errors';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    const user = await getUserServer(userId);
    return NextResponse.json({ user });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'GET',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el usuario.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    const body = await request.json();
    await updateUserServer(userId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el usuario.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    await deleteUserServer(userId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el usuario.',
    });
  }
}
