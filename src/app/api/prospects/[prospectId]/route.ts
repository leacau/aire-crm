import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { deleteProspectServer, updateProspectServer } from '@/lib/server/prospects';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    const body = await request.json();
    const originalData = await updateProspectServer(prospectId, body?.data, requester);

    return NextResponse.json({ ok: true, originalData });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el prospecto.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    await deleteProspectServer(prospectId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el prospecto.',
    });
  }
}
