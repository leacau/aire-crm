import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteCoachingItemServer,
  updateCoachingItemServer,
} from '@/lib/server/coaching';
import { getRequesterName } from '@/lib/server/clients';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/utils';
import type { CoachingItem } from '@/lib/types';

type RouteContext = {
  params: Promise<{ sessionId: string; itemId: string }>;
};

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
    return coachingErrorResponse(error, {
      action: 'ITEM UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el item de coaching.',
    });
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
    return coachingErrorResponse(error, {
      action: 'ITEM DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el item de coaching.',
    });
  }
}
