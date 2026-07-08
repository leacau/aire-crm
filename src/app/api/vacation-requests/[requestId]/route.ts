import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteVacationRequestServer,
  updateVacationRequestServer,
  VacationRequestApiError,
} from '@/lib/server/vacation-requests';
import type { VacationRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof VacationRequestApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Vacation request API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    await updateVacationRequestServer(requestId, body?.updates as Partial<VacationRequest>, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
