import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  CoachingApiError,
  deleteCoachingSessionServer,
  updateCoachingSessionServer,
} from '@/lib/server/coaching';
import type { CoachingSession } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching session API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    const body = await request.json();
    await updateCoachingSessionServer(sessionId, body?.data as Partial<CoachingSession>, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    await deleteCoachingSessionServer(
      sessionId,
      String(body?.userId || requester.uid),
      String(body?.userName || requester.name || requester.email || 'Usuario'),
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
