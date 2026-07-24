import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteVacationRequestServer,
  updateVacationRequestServer,
} from '@/lib/server/vacation-requests';
import { vacationRequestErrorResponse } from '@/app/api/vacation-requests/errors';
import type { VacationRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    await updateVacationRequestServer(requestId, body?.updates as Partial<VacationRequest>, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return vacationRequestErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la solicitud de licencia.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    await deleteVacationRequestServer(requestId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return vacationRequestErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la solicitud de licencia.',
    });
  }
}
