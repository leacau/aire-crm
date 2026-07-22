import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  adjustVacationDaysServer,
} from '@/lib/server/vacation-requests';
import { vacationRequestErrorResponse } from '@/app/api/vacation-requests/utils';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

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
    return vacationRequestErrorResponse(error, {
      action: 'DAYS ADJUST',
      requesterId: requester.uid,
      publicError: 'No se pudo ajustar el saldo de licencias.',
    });
  }
}
