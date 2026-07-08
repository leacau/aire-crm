import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { SupervisorComment } from '@/lib/types';

function mapComment(id: string, data: FirebaseFirestore.DocumentData | undefined): SupervisorComment {
  return serializeDocument<SupervisorComment>(id, data);
}

function compareByCreatedDesc(a: SupervisorComment, b: SupervisorComment) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function compareByLastMessageDesc(a: SupervisorComment, b: SupervisorComment) {
  return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const userId = searchParams.get('userId');

  if (entityType && entityId) {
    const snapshot = await dbAdmin
      .collection('supervisor_comments')
      .where('entityType', '==', entityType)
      .where('entityId', '==', entityId)
      .get();
    const comments = snapshot.docs.map(doc => mapComment(doc.id, doc.data())).sort(compareByCreatedDesc);
    return NextResponse.json({ comments });
  }

  if (userId) {
    if (userId !== requester.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const snapshot = await dbAdmin
      .collection('supervisor_comments')
      .where('lastMessageRecipientId', '==', userId)
      .get();
    const comments = snapshot.docs.map(doc => mapComment(doc.id, doc.data())).sort(compareByLastMessageDesc);
    return NextResponse.json({ comments });
  }

  return NextResponse.json({ error: 'Parametros insuficientes.' }, { status: 400 });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const message = String(body?.message || '').trim();
  const entityType = body?.entityType as 'client' | 'opportunity' | undefined;
  const entityId = String(body?.entityId || '').trim();

  if (!message || !entityType || !entityId) {
    return NextResponse.json({ error: 'Entidad y mensaje son obligatorios.' }, { status: 400 });
  }

  const requesterName = getRequesterName(requester);
  const docRef = await dbAdmin.collection('supervisor_comments').add({
    entityType,
    entityId,
    entityName: String(body?.entityName || ''),
    ownerId: String(body?.ownerId || ''),
    ownerName: String(body?.ownerName || ''),
    authorId: requester.uid,
    authorName: requesterName,
    message,
    recipientId: body?.recipientId || undefined,
    recipientName: body?.recipientName || undefined,
    createdAt: FieldValue.serverTimestamp(),
    replies: [],
    lastMessageAuthorId: requester.uid,
    lastMessageAuthorName: requesterName,
    lastMessageRecipientId: body?.recipientId || body?.ownerId || '',
    lastMessageRecipientName: body?.recipientName || body?.ownerName || '',
    lastMessageText: message,
    lastMessageAt: FieldValue.serverTimestamp(),
    lastSeenAtBy: {
      [requester.uid]: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ id: docRef.id });
}
