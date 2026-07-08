import { NextResponse } from 'next/server';
import { appendCoachingFollowUpEntryServer, CoachingApiError } from '@/lib/server/coaching';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string }>;
};

type FollowUpField = 'followUpDone' | 'followUpCurrent' | 'followUpNext';

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching entry API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

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
      String(body?.userId || requester.uid),
      String(body?.userName || requester.name || requester.email || 'Usuario'),
      requester,
    );
    return NextResponse.json({ entry });
  } catch (error) {
    return errorResponse(error);
  }
}
