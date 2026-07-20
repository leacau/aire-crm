import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  canAssignCommercialNoteAdvisor,
  filterAccessibleCommercialNotes,
} from '@/lib/server/commercial-note-access';
import {
  cleanCommercialNotePayload,
  compareCommercialNotesByCreatedAtDesc,
  mapCommercialNote,
} from '@/app/api/commercial-notes/utils';
import type { CommercialNote } from '@/lib/types';

async function getFilteredNotes(field?: string, value?: string): Promise<CommercialNote[]> {
  const collectionRef = dbAdmin.collection('commercial_notes');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapCommercialNote(doc.id, doc.data()))
    .sort(compareCommercialNotesByCreatedAtDesc);
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const advisorId = searchParams.get('advisorId');
  const orderId = searchParams.get('orderId');

  let notes: CommercialNote[];
  if (clientId) {
    notes = await getFilteredNotes('clientId', clientId);
  } else if (advisorId) {
    notes = await getFilteredNotes('advisorId', advisorId);
  } else if (orderId) {
    notes = await getFilteredNotes('orderId', orderId);
  } else {
    notes = await getFilteredNotes();
  }

  notes = await filterAccessibleCommercialNotes(notes, requester);

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const noteData = body?.noteData as Omit<CommercialNote, 'id' | 'createdAt'> | undefined;

  if (!noteData?.clientId || !noteData.clientName) {
    return NextResponse.json({ error: 'Cliente obligatorio para crear la nota.' }, { status: 400 });
  }

  const requesterName = getRequesterName(requester);
  const advisorId = canAssignCommercialNoteAdvisor(requester) && noteData.advisorId
    ? noteData.advisorId
    : requester.uid;
  const advisorName = canAssignCommercialNoteAdvisor(requester) && noteData.advisorName
    ? noteData.advisorName
    : requesterName;
  const batch = dbAdmin.batch();
  const noteRef = dbAdmin.collection('commercial_notes').doc();
  const dataToSave = {
    ...cleanCommercialNotePayload(noteData as unknown as Record<string, unknown>),
    advisorId,
    advisorName,
    createdAt: FieldValue.serverTimestamp(),
  };

  batch.set(noteRef, dataToSave);

  const activityRef = dbAdmin.collection('client-activities').doc();
  batch.set(activityRef, {
    clientId: noteData.clientId,
    clientName: noteData.clientName,
    userId: requester.uid,
    userName: requesterName,
    type: 'Otra',
    observation: `Genero una Nota Comercial: "${noteData.title || 'Sin titulo'}" (Valor: $${Number(noteData.totalValue || 0).toLocaleString()})`,
    timestamp: FieldValue.serverTimestamp(),
    isTask: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  const systemLogRef = dbAdmin.collection('activities').doc();
  batch.set(systemLogRef, {
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'commercial_note',
    entityId: noteRef.id,
    entityName: 'Nota Comercial',
    details: `creo una nota comercial para <strong>${noteData.clientName}</strong>`,
    ownerName: advisorName,
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return NextResponse.json({ id: noteRef.id });
}
