import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { supervisorCommentErrorResponse } from '@/app/api/supervisor-comments/errors';
import type { SupervisorComment } from '@/lib/types';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

function canDeleteComment(comment: SupervisorComment, requesterId: string, hasManagement: boolean) {
  return hasManagement
    || comment.authorId === requesterId
    || comment.ownerId === requesterId
    || comment.recipientId === requesterId
    || comment.lastMessageRecipientId === requesterId;
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { commentId } = await context.params;
    const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Comentario no encontrado.' }, { status: 404 });
    }

    const comment = serializeDocument<SupervisorComment>(snapshot.id, snapshot.data());
    if (!canDeleteComment(comment, requester.uid, hasServerManagementPrivileges(requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el comentario de supervision.',
    });
  }
}
