import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import {
  canAssignAdvisorScopedOwner,
  filterAccessibleAdvisorScopedRecords,
} from '@/lib/server/advisor-scoped-access';
import { cleanWebNotePayload, compareWebNotesByCreatedAtDesc, mapWebNote } from '@/app/api/web-notes/utils';
import type { WebNote } from '@/lib/types';

async function getFilteredWebNotes(field?: string, value?: string): Promise<WebNote[]> {
  const collectionRef = dbAdmin.collection('web_notes');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapWebNote(doc.id, doc.data()))
    .sort(compareWebNotesByCreatedAtDesc);
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const orderId = searchParams.get('orderId');

  let notes: WebNote[];
  if (clientId) {
    notes = await getFilteredWebNotes('clientId', clientId);
  } else if (orderId) {
    notes = await getFilteredWebNotes('orderId', orderId);
  } else {
    notes = await getFilteredWebNotes();
  }

  notes = await filterAccessibleAdvisorScopedRecords(notes, requester);

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const noteData = body?.noteData as Omit<WebNote, 'id' | 'createdAt'> | undefined;

  if (!noteData?.clientId || !noteData.clientName || !noteData.format) {
    return NextResponse.json({ error: 'Cliente y formato son obligatorios.' }, { status: 400 });
  }

  const requesterName = getRequesterName(requester);
  const advisorId = canAssignAdvisorScopedOwner(requester) && noteData.advisorId
    ? noteData.advisorId
    : requester.uid;
  const advisorName = canAssignAdvisorScopedOwner(requester) && noteData.advisorName
    ? noteData.advisorName
    : requesterName;
  const dataToSave = {
    ...cleanWebNotePayload(noteData as unknown as Record<string, unknown>),
    advisorId,
    advisorName,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('web_notes').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'commercial_note' as any,
    entityId: docRef.id,
    entityName: noteData.clientName,
    details: `cargo un pedido de Nota Web / Gacetilla para <strong>${noteData.clientName}</strong>`,
    ownerName: advisorName,
  });

  return NextResponse.json({ id: docRef.id });
}
