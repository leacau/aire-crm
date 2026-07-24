import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/requester';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import {
  canAccessCommercialNote,
  canAssignCommercialNoteAdvisor,
  filterAccessibleCommercialNotes,
} from '@/lib/server/commercial-note-access';
import type { CommercialNote } from '@/lib/types';

export class CommercialNoteApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function mapCommercialNote(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): CommercialNote {
  return serializeDocument<CommercialNote>(id, data);
}

export function compareCommercialNotesByCreatedAtDesc(a: CommercialNote, b: CommercialNote) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanCommercialNotePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}

async function getFilteredNotes(field?: string, value?: string): Promise<CommercialNote[]> {
  const collectionRef = dbAdmin.collection('commercial_notes');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapCommercialNote(doc.id, doc.data()))
    .sort(compareCommercialNotesByCreatedAtDesc);
}

export async function listCommercialNotesServer(options: {
  clientId?: string | null;
  advisorId?: string | null;
  orderId?: string | null;
}, requester: ServerUser) {
  let notes: CommercialNote[];
  if (options.clientId) {
    notes = await getFilteredNotes('clientId', options.clientId);
  } else if (options.advisorId) {
    notes = await getFilteredNotes('advisorId', options.advisorId);
  } else if (options.orderId) {
    notes = await getFilteredNotes('orderId', options.orderId);
  } else {
    notes = await getFilteredNotes();
  }

  return filterAccessibleCommercialNotes(notes, requester);
}

export async function createCommercialNoteServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const noteData = body.noteData as Omit<CommercialNote, 'id' | 'createdAt'> | undefined;

  if (!noteData?.clientId || !noteData.clientName) {
    throw new CommercialNoteApiError('Cliente obligatorio para crear la nota.', 400);
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

  return noteRef.id;
}

export async function getCommercialNoteServer(noteId: string, requester: ServerUser) {
  const snap = await dbAdmin.collection('commercial_notes').doc(noteId).get();
  if (!snap.exists) return null;

  const note = mapCommercialNote(snap.id, snap.data());
  if (!(await canAccessCommercialNote(note, requester))) {
    throw new CommercialNoteApiError('Forbidden', 403);
  }

  return note;
}

export async function updateCommercialNoteServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const noteData = (body.noteData || {}) as Partial<Omit<CommercialNote, 'id' | 'createdAt'>>;
  const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new CommercialNoteApiError('Nota no encontrada', 404);
  }

  const originalNote = mapCommercialNote(snap.id, snap.data());
  if (!(await canAccessCommercialNote(originalNote, requester))) {
    throw new CommercialNoteApiError('Forbidden', 403);
  }

  const changesAdvisor =
    (noteData.advisorId !== undefined && noteData.advisorId !== originalNote.advisorId) ||
    (noteData.advisorName !== undefined && noteData.advisorName !== originalNote.advisorName);

  if (!canAssignCommercialNoteAdvisor(requester) && changesAdvisor) {
    throw new CommercialNoteApiError('Forbidden', 403);
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
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: noteData.title || 'Nota Comercial',
    details: `edito la nota comercial <strong>${noteData.title || 'Nota Comercial'}</strong>`,
    ownerName: noteData.advisorName || requesterName,
  });
}

export async function deleteCommercialNoteServer(noteId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new CommercialNoteApiError('Nota no encontrada', 404);
  }

  if (!hasServerManagementPrivileges(requester)) {
    throw new CommercialNoteApiError('Forbidden', 403);
  }

  const noteData = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: noteData.title || 'Nota Comercial',
    details: `elimino la nota comercial <strong>${noteData.title || 'Nota Comercial'}</strong>`,
    ownerName: noteData.advisorName || 'Desconocido',
  });
}

export async function linkCommercialNoteOrderServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const orderTitle = typeof body.orderTitle === 'string' ? body.orderTitle.trim() : '';

  if (!orderId || !orderTitle) {
    throw new CommercialNoteApiError('Orden obligatoria para vincular la nota.', 400);
  }

  const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new CommercialNoteApiError('Nota no encontrada', 404);
  }

  const note = mapCommercialNote(snap.id, snap.data());
  if (!(await canAccessCommercialNote(note, requester))) {
    throw new CommercialNoteApiError('Forbidden', 403);
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
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: 'Nota Comercial',
    details: `vinculo una nota comercial a la orden <strong>${orderTitle}</strong>`,
    ownerName: requesterName,
  });
}

export async function unlinkCommercialNoteOrderServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!reason) {
    throw new CommercialNoteApiError('Debe indicar el motivo de la desvinculacion.', 400);
  }

  const docRef = dbAdmin.collection('commercial_notes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new CommercialNoteApiError('Nota no encontrada', 404);
  }

  const note = mapCommercialNote(snap.id, snap.data());
  if (!(await canAccessCommercialNote(note, requester))) {
    throw new CommercialNoteApiError('Forbidden', 403);
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
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: 'Nota Comercial',
    details: 'quito la vinculacion de una nota comercial con una orden de publicidad',
    ownerName: requesterName,
  });
}
