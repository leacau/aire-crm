import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { supervisorCommentErrorResponse } from '@/app/api/supervisor-comments/errors';
import { replySupervisorCommentServer } from '@/lib/server/supervisor-comments';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { commentId } = await context.params;
    const body = await request.json();
    await replySupervisorCommentServer(commentId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'REPLY',
      requesterId: requester.uid,
      publicError: 'No se pudo responder el comentario de supervision.',
    });
  }
}
