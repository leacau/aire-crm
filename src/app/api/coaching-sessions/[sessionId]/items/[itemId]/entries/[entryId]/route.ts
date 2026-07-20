import { NextResponse } from 'next/server';
import {
  CoachingApiError,
  deleteCoachingFollowUpEntryServer,
  updateCoachingFollowUpEntryServer,
} from '@/lib/server/coaching';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string; entryId: string }>;
};

type FollowUpField = 'followUpDone' | 'followUpCurrent' | 'followUpNext';

function getRequesterName(requester: { name?: string; email?: string }) {
  return requester.name || requester.email || 'Usuario';
}

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching entry API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId, itemId, entryId } = await context.params;
    const body = await request.json();
    await updateCoachingFollowUpEntryServer(
      sessionId,
      itemId,
      body?.field as FollowUpField,
      entryId,
      String(body?.text || ''),
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
    const { sessionId, itemId, entryId } = await context.params;
    const body = await request.json().catch(() => ({}));
    await deleteCoachingFollowUpEntryServer(
      sessionId,
      itemId,
      body?.field as FollowUpField,
      entryId,
      requester.uid,
      getRequesterName(requester),
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
