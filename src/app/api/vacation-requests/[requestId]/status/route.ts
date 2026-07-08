import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  approveVacationRequestServer,
  VacationRequestApiError,
} from '@/lib/server/vacation-requests';
import type { VacationRequestStatus } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof VacationRequestApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Vacation request status API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    const result = await approveVacationRequestServer(
      requestId,
      body?.newStatus as VacationRequestStatus,
      String(body?.approverId || requester.uid),
      body?.applicantEmail || null,
      requester,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
