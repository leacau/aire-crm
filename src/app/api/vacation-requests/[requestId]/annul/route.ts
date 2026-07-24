import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  annulVacationRequestServer,
} from '@/lib/server/vacation-requests';
import { vacationRequestErrorResponse } from '@/app/api/vacation-requests/errors';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    const result = await annulVacationRequestServer(
      requestId,
      String(body?.reason || ''),
      String(body?.managerId || requester.uid),
      String(body?.managerName || requester.name || requester.email || 'Usuario'),
      body?.applicantEmail || null,
      requester,
    );
    return NextResponse.json(result);
  } catch (error) {
    return vacationRequestErrorResponse(error, {
      action: 'ANNUL',
      requesterId: requester.uid,
      publicError: 'No se pudo anular la solicitud de licencia.',
    });
  }
}
