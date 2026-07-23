import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { supervisorCommentErrorResponse } from '@/app/api/supervisor-comments/errors';
import { markSupervisorCommentSeenServer } from '@/lib/server/supervisor-comments';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { commentId } = await context.params;
    await markSupervisorCommentSeenServer(commentId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'SEEN',
      requesterId: requester.uid,
      publicError: 'No se pudo marcar el comentario como visto.',
    });
  }
}
