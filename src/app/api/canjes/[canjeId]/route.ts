import { NextResponse } from 'next/server';
import { canjeErrorResponse } from '@/app/api/canjes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { deleteCanjeServer, updateCanjeServer } from '@/lib/server/canjes';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    const body = await request.json();
    await updateCanjeServer(canjeId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el canje.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    await deleteCanjeServer(canjeId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el canje.',
    });
  }
}
