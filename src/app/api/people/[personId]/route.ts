import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { peopleErrorResponse } from '@/app/api/people/errors';
import { deletePersonServer, updatePersonServer } from '@/lib/server/people';
import type { Person } from '@/lib/types';

type RouteContext = {
  params: Promise<{ personId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { personId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<Person, 'id'>>;
    await updatePersonServer(personId, data, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return peopleErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el contacto.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { personId } = await context.params;
    await deletePersonServer(personId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return peopleErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el contacto.',
    });
  }
}
