import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { canAccessAdvisorScopedRecord } from '@/lib/server/advisor-scoped-access';
import { mapWebNote } from '@/app/api/web-notes/utils';

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
      return NextResponse.json({ error: 'Orden obligatoria para vincular la nota web.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('web_notes').doc(noteId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota Web no encontrada' }, { status: 404 });
    }

    const note = mapWebNote(snap.id, snap.data());
    if (!(await canAccessAdvisorScopedRecord(note, requester))) {
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
      entityName: 'Nota Web',
      details: `vinculo una nota web a la orden <strong>${orderTitle}</strong>`,
      ownerName: requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('WEB NOTE ORDER LINK ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo vincular la nota web con la orden.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
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

    const docRef = dbAdmin.collection('web_notes').doc(noteId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota Web no encontrada' }, { status: 404 });
    }

    const note = mapWebNote(snap.id, snap.data());
    if (!(await canAccessAdvisorScopedRecord(note, requester))) {
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
      entityName: 'Nota Web',
      details: 'quito la vinculacion de una nota web con una orden de publicidad',
      ownerName: requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('WEB NOTE ORDER UNLINK ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo desvincular la nota web de la orden.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
