import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  CoachingApiError,
  deleteCoachingItemServer,
  updateCoachingItemServer,
} from '@/lib/server/coaching';
import type { CoachingItem } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string }>;
};

function getRequesterName(requester: { name?: string; email?: string }) {
  return requester.name || requester.email || 'Usuario';
}

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching session item API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId, itemId } = await context.params;
    const body = await request.json();
    await updateCoachingItemServer(
      sessionId,
      itemId,
      body?.updates as Partial<CoachingItem>,
      requester.uid,
      getRequesterName(requester),
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId, itemId } = await context.params;
    await deleteCoachingItemServer(sessionId, itemId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
