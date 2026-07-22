import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { cleanCommercialNotePayload, mapCommercialNote } from '@/app/api/commercial-notes/utils';
import { canAccessCommercialNote, canAssignCommercialNoteAdvisor } from '@/lib/server/commercial-note-access';
import type { CommercialNote } from '@/lib/types';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const snap = await dbAdmin.collection('commercial_notes').doc(noteId).get();
    if (!snap.exists) {
      return NextResponse.json({ note: null });
    }

    const note = mapCommercialNote(snap.id, snap.data());
    if (!(await canAccessCommercialNote(note, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ note });
  } catch (error: any) {
    console.error('COMMERCIAL NOTE DETAIL ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo cargar la nota comercial.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    const noteData = (body?.noteData || {}) as Partial<Omit<CommercialNote, 'id' | 'createdAt'>>;
    const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
    }

    const originalNote = mapCommercialNote(snap.id, snap.data());
    if (!(await canAccessCommercialNote(originalNote, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const changesAdvisor =
      (noteData.advisorId !== undefined && noteData.advisorId !== originalNote.advisorId) ||
      (noteData.advisorName !== undefined && noteData.advisorName !== originalNote.advisorName);

    if (!canAssignCommercialNoteAdvisor(requester) && changesAdvisor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData = {
      ...cleanCommercialNotePayload(noteData as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (Array.isArray(noteData.approvalHistory)) {
      delete (updateData as Record<string, unknown>).approvalHistory;
      if (noteData.approvalHistory.length > 0) {
        (updateData as Record<string, unknown>).approvalHistory = FieldValue.arrayUnion(...noteData.approvalHistory);
      }
    }

    await docRef.update(updateData);

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'commercial_note' as any,
      entityId: noteId,
      entityName: noteData.title || 'Nota Comercial',
      details: `edito la nota comercial <strong>${noteData.title || 'Nota Comercial'}</strong>`,
      ownerName: noteData.advisorName || requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('COMMERCIAL NOTE UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar la nota comercial.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
    }

    if (!hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  } catch (error: any) {
    console.error('COMMERCIAL NOTE DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo eliminar la nota comercial.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
