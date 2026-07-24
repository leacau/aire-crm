import { NextResponse } from 'next/server';
import {
  deleteCoachingFollowUpEntryServer,
  updateCoachingFollowUpEntryServer,
} from '@/lib/server/coaching';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getRequesterName } from '@/lib/server/clients';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/utils';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string; entryId: string }>;
};

type FollowUpField = 'followUpDone' | 'followUpCurrent' | 'followUpNext';

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
    return coachingErrorResponse(error, {
      action: 'ENTRY UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el seguimiento de coaching.',
    });
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
    return coachingErrorResponse(error, {
      action: 'ENTRY DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el seguimiento de coaching.',
    });
  }
}
