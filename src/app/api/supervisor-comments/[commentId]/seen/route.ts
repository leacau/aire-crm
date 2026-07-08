import { NextResponse } from 'next/server';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { commentId } = await context.params;
  const docRef = dbAdmin.collection('supervisor_comments').doc(commentId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: 'Comentario no encontrado.' }, { status: 404 });
  }

  await docRef.update(new FieldPath('lastSeenAtBy', requester.uid), FieldValue.serverTimestamp());

  return NextResponse.json({ ok: true });
}
