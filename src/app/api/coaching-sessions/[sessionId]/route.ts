import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getRequesterName } from '@/lib/server/requester';
import {
  deleteCoachingSessionServer,
  updateCoachingSessionServer,
} from '@/lib/server/coaching';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/utils';
import type { CoachingSession } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    const body = await request.json();
    await updateCoachingSessionServer(sessionId, body?.data as Partial<CoachingSession>, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'SESSION UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la sesion de coaching.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    await deleteCoachingSessionServer(
      sessionId,
      requester.uid,
      getRequesterName(requester),
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'SESSION DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la sesion de coaching.',
    });
  }
}
