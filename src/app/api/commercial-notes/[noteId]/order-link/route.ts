import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { canAccessCommercialNote } from '@/lib/server/commercial-note-access';
import { mapCommercialNote } from '@/app/api/commercial-notes/utils';
import { orderLinkErrorResponse } from '@/app/api/order-links/errors';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const orderTitle = typeof body?.orderTitle === 'string' ? body.orderTitle.trim() : '';

    if (!orderId || !orderTitle) {
      return NextResponse.json({ error: 'Orden obligatoria para vincular la nota.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
    }

    const note = mapCommercialNote(snap.id, snap.data());
    if (!(await canAccessCommercialNote(note, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.update({
      orderId,
      orderTitle,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'commercial_note' as any,
      entityId: noteId,
      entityName: 'Nota Comercial',
      details: `vinculo una nota comercial a la orden <strong>${orderTitle}</strong>`,
      ownerName: requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return orderLinkErrorResponse(error, {
      action: 'COMMERCIAL NOTE LINK',
      requesterId: requester.uid,
      publicError: 'No se pudo vincular la nota comercial con la orden.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!reason) {
      return NextResponse.json({ error: 'Debe indicar el motivo de la desvinculacion.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
    }

    const note = mapCommercialNote(snap.id, snap.data());
    if (!(await canAccessCommercialNote(note, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requesterName = getRequesterName(requester);
    await docRef.update({
      orderId: FieldValue.delete(),
      orderTitle: FieldValue.delete(),
      orderUnlinkedAt: FieldValue.serverTimestamp(),
      orderUnlinkedById: requester.uid,
      orderUnlinkedByName: requesterName,
      orderUnlinkReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'commercial_note' as any,
      entityId: noteId,
      entityName: 'Nota Comercial',
      details: 'quito la vinculacion de una nota comercial con una orden de publicidad',
      ownerName: requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return orderLinkErrorResponse(error, {
      action: 'COMMERCIAL NOTE UNLINK',
      requesterId: requester.uid,
      publicError: 'No se pudo desvincular la nota comercial de la orden.',
    });
  }
}
