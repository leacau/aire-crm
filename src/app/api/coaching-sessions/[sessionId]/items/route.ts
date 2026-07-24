import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { addItemsToSessionServer } from '@/lib/server/coaching';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/errors';
import type { CoachingItem } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { sessionId } = await context.params;
    const body = await request.json();
    await addItemsToSessionServer(sessionId, (body?.newItems || []) as CoachingItem[], requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'ITEMS ADD',
      requesterId: requester.uid,
      publicError: 'No se pudieron agregar items a la sesion de coaching.',
    });
  }
}
