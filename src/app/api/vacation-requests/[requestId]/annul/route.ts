import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  annulVacationRequestServer,
  VacationRequestApiError,
} from '@/lib/server/vacation-requests';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof VacationRequestApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Vacation request annul API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

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
    return errorResponse(error);
  }
}
