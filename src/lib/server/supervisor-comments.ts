import { randomUUID } from 'crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/clients';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { SupervisorComment, SupervisorCommentReply } from '@/lib/types';

export class SupervisorCommentApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function mapComment(id: string, data: FirebaseFirestore.DocumentData | undefined): SupervisorComment {
  return serializeDocument<SupervisorComment>(id, data);
}

function compareByCreatedDesc(a: SupervisorComment, b: SupervisorComment) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function compareByLastMessageDesc(a: SupervisorComment, b: SupervisorComment) {
  return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
}

function canDeleteComment(comment: SupervisorComment, requesterId: string, hasManagement: boolean) {
  return hasManagement
    || comment.authorId === requesterId
    || comment.ownerId === requesterId
    || comment.recipientId === requesterId
    || comment.lastMessageRecipientId === requesterId;
}

export async function listSupervisorCommentsServer(options: {
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
}, requester: ServerUser) {
  if (options.entityType && options.entityId) {
    const snapshot = await dbAdmin
      .collection('supervisor_comments')
      .where('entityType', '==', options.entityType)
      .where('entityId', '==', options.entityId)
      .get();
    return snapshot.docs.map(doc => mapComment(doc.id, doc.data())).sort(compareByCreatedDesc);
  }

  if (options.userId) {
    if (options.userId !== requester.uid) {
      throw new SupervisorCommentApiError('Forbidden', 403);
    }
    const snapshot = await dbAdmin
      .collection('supervisor_comments')
      .where('lastMessageRecipientId', '==', options.userId)
      .get();
    return snapshot.docs.map(doc => mapComment(doc.id, doc.data())).sort(compareByLastMessageDesc);
  }

  throw new SupervisorCommentApiError('Parametros insuficientes.', 400);
}

export async function createSupervisorCommentServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const message = String(body.message || '').trim();
  const entityType = body.entityType as 'client' | 'opportunity' | undefined;
  const entityId = String(body.entityId || '').trim();

  if (!message || !entityType || !entityId) {
    throw new SupervisorCommentApiError('Entidad y mensaje son obligatorios.', 400);
  }

  const requesterName = getRequesterName(requester);
  const docRef = await dbAdmin.collection('supervisor_comments').add({
    entityType,
    entityId,
    entityName: String(body.entityName || ''),
    ownerId: String(body.ownerId || ''),
    ownerName: String(body.ownerName || ''),
    authorId: requester.uid,
    authorName: requesterName,
    message,
    recipientId: body.recipientId || undefined,
    recipientName: body.recipientName || undefined,
    createdAt: FieldValue.serverTimestamp(),
    replies: [],
    lastMessageAuthorId: requester.uid,
    lastMessageAuthorName: requesterName,
    lastMessageRecipientId: body.recipientId || body.ownerId || '',
    lastMessageRecipientName: body.recipientName || body.ownerName || '',
    lastMessageText: message,
    lastMessageAt: FieldValue.serverTimestamp(),
    lastSeenAtBy: {
      [requester.uid]: FieldValue.serverTimestamp(),
    },
  });

  return docRef.id;
}

export async function deleteSupervisorCommentServer(commentId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new SupervisorCommentApiError('Comentario no encontrado.', 404);
  }

  const comment = mapComment(snapshot.id, snapshot.data());
  if (!canDeleteComment(comment, requester.uid, hasServerManagementPrivileges(requester))) {
    throw new SupervisorCommentApiError('Forbidden', 403);
  }

  await docRef.delete();
}

export async function replySupervisorCommentServer(commentId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const message = String(body.message || '').trim();

  if (!message) {
    throw new SupervisorCommentApiError('El mensaje es obligatorio.', 400);
  }

  const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new SupervisorCommentApiError('Comentario no encontrado.', 404);
  }

  const requesterName = getRequesterName(requester);
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId : undefined;
  const recipientName = typeof body.recipientName === 'string' ? body.recipientName : undefined;
  const reply: SupervisorCommentReply = {
    id: randomUUID(),
    authorId: requester.uid,
    authorName: requesterName,
    message,
    recipientId,
    recipientName,
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
}

export async function markSupervisorCommentSeenServer(commentId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new SupervisorCommentApiError('Comentario no encontrado.', 404);
  }

  await docRef.update(new FieldPath('lastSeenAtBy', requester.uid), FieldValue.serverTimestamp());
}
