import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { cleanWebNotePayload, mapWebNote } from '@/app/api/web-notes/utils';
import {
  canAccessAdvisorScopedRecord,
  canAssignAdvisorScopedOwner,
  changesAdvisorScopedOwner,
} from '@/lib/server/advisor-scoped-access';
import type { WebNote } from '@/lib/types';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { noteId } = await context.params;
  const snap = await dbAdmin.collection('web_notes').doc(noteId).get();
  if (!snap.exists) {
    return NextResponse.json({ note: null });
  }

  const note = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(note, requester))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    note,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { noteId } = await context.params;
  const body = await request.json();
  const data = (body?.data || {}) as Partial<Omit<WebNote, 'id' | 'createdAt'>>;
  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Nota Web no encontrada' }, { status: 404 });
  }

  const originalData = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(originalData, requester))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canAssignAdvisorScopedOwner(requester) && changesAdvisorScopedOwner(data, originalData)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateData = {
    ...cleanWebNotePayload(data as Record<string, unknown>),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (Array.isArray(data.approvalHistory)) {
    delete (updateData as Record<string, unknown>).approvalHistory;
    if (data.approvalHistory.length > 0) {
      (updateData as Record<string, unknown>).approvalHistory = FieldValue.arrayUnion(...data.approvalHistory);
    }
  }

  await docRef.update({
    ...updateData,
  });

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'commercial_note' as any,
    entityId: noteId,
    entityName: data.clientName || originalData.clientName,
    details: `actualizo un pedido de Nota Web / Gacetilla de <strong>${data.clientName || originalData.clientName}</strong>`,
    ownerName: data.advisorName || originalData.advisorName,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { noteId } = await context.params;
  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ ok: true });
  }

  const noteData = mapWebNote(snap.id, snap.data());
  if (!hasServerManagementPrivileges(requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'commercial_note' as any,
    entityId: noteId,
    entityName: noteData.clientName,
    details: `elimino el pedido de Nota Web / Gacetilla de <strong>${noteData.clientName}</strong>`,
    ownerName: noteData.advisorName,
  });

  return NextResponse.json({ ok: true });
}
