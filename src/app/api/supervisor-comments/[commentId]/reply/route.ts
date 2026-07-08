import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import type { SupervisorCommentReply } from '@/lib/types';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { commentId } = await context.params;
  const body = await request.json();
  const message = String(body?.message || '').trim();

  if (!message) {
    return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
  }

  const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: 'Comentario no encontrado.' }, { status: 404 });
  }

  const requesterName = getRequesterName(requester);
  const reply: SupervisorCommentReply = {
    id: randomUUID(),
    authorId: requester.uid,
    authorName: requesterName,
    message,
    recipientId: body?.recipientId || undefined,
    recipientName: body?.recipientName || undefined,
    createdAt: new Date().toISOString(),
  };

  await docRef.update({
    replies: FieldValue.arrayUnion(reply),
    lastMessageAuthorId: requester.uid,
    lastMessageAuthorName: requesterName,
    lastMessageRecipientId: reply.recipientId || '',
    lastMessageRecipientName: reply.recipientName || '',
    lastMessageText: message,
    lastMessageAt: FieldValue.serverTimestamp(),
    [`lastSeenAtBy.${requester.uid}`]: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
