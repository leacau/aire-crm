import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  adjustVacationDaysServer,
  VacationRequestApiError,
} from '@/lib/server/vacation-requests';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof VacationRequestApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Vacation days API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    const body = await request.json();
    await adjustVacationDaysServer(
      userId,
      Number(body?.days || 0),
      String(body?.updatedBy || requester.uid),
      String(body?.updatedByName || requester.name || requester.email || 'Usuario'),
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
