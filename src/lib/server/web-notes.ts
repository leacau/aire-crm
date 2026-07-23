import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/clients';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import {
  canAccessAdvisorScopedRecord,
  canAssignAdvisorScopedOwner,
  changesAdvisorScopedOwner,
  filterAccessibleAdvisorScopedRecords,
} from '@/lib/server/advisor-scoped-access';
import type { WebNote } from '@/lib/types';

export class WebNoteApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function mapWebNote(id: string, data: FirebaseFirestore.DocumentData | undefined): WebNote {
  return serializeDocument<WebNote>(id, data);
}

export function compareWebNotesByCreatedAtDesc(a: WebNote, b: WebNote) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanWebNotePayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}

async function getFilteredWebNotes(field?: string, value?: string): Promise<WebNote[]> {
  const collectionRef = dbAdmin.collection('web_notes');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapWebNote(doc.id, doc.data()))
    .sort(compareWebNotesByCreatedAtDesc);
}

export async function listWebNotesServer(options: {
  clientId?: string | null;
  orderId?: string | null;
}, requester: ServerUser) {
  let notes: WebNote[];
  if (options.clientId) {
    notes = await getFilteredWebNotes('clientId', options.clientId);
  } else if (options.orderId) {
    notes = await getFilteredWebNotes('orderId', options.orderId);
  } else {
    notes = await getFilteredWebNotes();
  }

  return filterAccessibleAdvisorScopedRecords(notes, requester);
}

export async function createWebNoteServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const noteData = body.noteData as Omit<WebNote, 'id' | 'createdAt'> | undefined;

  if (!noteData?.clientId || !noteData.clientName || !noteData.format) {
    throw new WebNoteApiError('Cliente y formato son obligatorios.', 400);
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
    entityType: 'commercial_note',
    entityId: docRef.id,
    entityName: noteData.clientName,
    details: `cargo un pedido de Nota Web / Gacetilla para <strong>${noteData.clientName}</strong>`,
    ownerName: advisorName,
  });

  return docRef.id;
}

export async function getWebNoteServer(noteId: string, requester: ServerUser) {
  const snap = await dbAdmin.collection('web_notes').doc(noteId).get();
  if (!snap.exists) return null;

  const note = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(note, requester))) {
    throw new WebNoteApiError('Forbidden', 403);
  }

  return note;
}

export async function updateWebNoteServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const data = (body.data || {}) as Partial<Omit<WebNote, 'id' | 'createdAt'>>;
  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new WebNoteApiError('Nota Web no encontrada', 404);
  }

  const originalData = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(originalData, requester))) {
    throw new WebNoteApiError('Forbidden', 403);
  }

  if (!canAssignAdvisorScopedOwner(requester) && changesAdvisorScopedOwner(data, originalData)) {
    throw new WebNoteApiError('Forbidden', 403);
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

  await docRef.update(updateData);

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: data.clientName || originalData.clientName,
    details: `actualizo un pedido de Nota Web / Gacetilla de <strong>${data.clientName || originalData.clientName}</strong>`,
    ownerName: data.advisorName || originalData.advisorName,
  });
}

export async function deleteWebNoteServer(noteId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();

  if (!snap.exists) return;

  const noteData = mapWebNote(snap.id, snap.data());
  if (!hasServerManagementPrivileges(requester)) {
    throw new WebNoteApiError('Forbidden', 403);
  }

  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'commercial_note',
    entityId: noteId,
    entityName: noteData.clientName,
    details: `elimino el pedido de Nota Web / Gacetilla de <strong>${noteData.clientName}</strong>`,
    ownerName: noteData.advisorName,
  });
}

export async function linkWebNoteOrderServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const orderTitle = typeof body.orderTitle === 'string' ? body.orderTitle.trim() : '';

  if (!orderId || !orderTitle) {
    throw new WebNoteApiError('Orden obligatoria para vincular la nota web.', 400);
  }

  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new WebNoteApiError('Nota Web no encontrada', 404);
  }

  const note = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(note, requester))) {
    throw new WebNoteApiError('Forbidden', 403);
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
    entityName: 'Nota Web',
    details: `vinculo una nota web a la orden <strong>${orderTitle}</strong>`,
    ownerName: requesterName,
  });
}

export async function unlinkWebNoteOrderServer(noteId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!reason) {
    throw new WebNoteApiError('Debe indicar el motivo de la desvinculacion.', 400);
  }

  const docRef = dbAdmin.collection('web_notes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new WebNoteApiError('Nota Web no encontrada', 404);
  }

  const note = mapWebNote(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(note, requester))) {
    throw new WebNoteApiError('Forbidden', 403);
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
    entityName: 'Nota Web',
    details: 'quito la vinculacion de una nota web con una orden de publicidad',
    ownerName: requesterName,
  });
}
