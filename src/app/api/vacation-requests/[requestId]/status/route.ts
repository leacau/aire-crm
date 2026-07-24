import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  approveVacationRequestServer,
} from '@/lib/server/vacation-requests';
import { vacationRequestErrorResponse } from '@/app/api/vacation-requests/errors';
import type { VacationRequestStatus } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

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
    return vacationRequestErrorResponse(error, {
      action: 'STATUS UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo cambiar el estado de la solicitud de licencia.',
    });
  }
}
