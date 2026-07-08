import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { addItemsToSessionServer, CoachingApiError } from '@/lib/server/coaching';
import type { CoachingItem } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching session items API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    const body = await request.json();
    await addItemsToSessionServer(sessionId, (body?.newItems || []) as CoachingItem[], requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
