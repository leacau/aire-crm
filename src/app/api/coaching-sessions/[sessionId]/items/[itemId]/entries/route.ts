import { NextResponse } from 'next/server';
import { appendCoachingFollowUpEntryServer } from '@/lib/server/coaching';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { coachingErrorResponse, getRequesterName } from '@/app/api/coaching-sessions/utils';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string }>;
};

type FollowUpField = 'followUpDone' | 'followUpCurrent' | 'followUpNext';

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId, itemId } = await context.params;
    const body = await request.json();
    const entry = await appendCoachingFollowUpEntryServer(
      sessionId,
      itemId,
      body?.field as FollowUpField,
      String(body?.text || ''),
      requester.uid,
      getRequesterName(requester),
      requester,
    );
    return NextResponse.json({ entry });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'ENTRY CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo agregar el seguimiento de coaching.',
    });
  }
}
