import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { supervisorCommentErrorResponse } from '@/app/api/supervisor-comments/errors';
import { deleteSupervisorCommentServer } from '@/lib/server/supervisor-comments';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { commentId } = await context.params;
    await deleteSupervisorCommentServer(commentId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el comentario de supervision.',
    });
  }
}
