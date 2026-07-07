import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { noteId } = await context.params;
  const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
  }

  const noteData = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'commercial_note' as any,
    entityId: noteId,
    entityName: noteData.title || 'Nota Comercial',
    details: `elimino la nota comercial <strong>${noteData.title || 'Nota Comercial'}</strong>`,
    ownerName: noteData.advisorName || 'Desconocido',
  });

  return NextResponse.json({ ok: true });
}
