import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { logServerActivity } from '@/lib/server/activity';
import type {
  CoachingActiveIndex,
  CoachingActiveIndexEntry,
  CoachingFollowUpEntry,
  CoachingItem,
  CoachingSession,
} from '@/lib/types';

type FollowUpField = 'followUpDone' | 'followUpCurrent' | 'followUpNext';

export class CoachingApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function newId() {
  return crypto.randomUUID();
}

function assertCanAccessSession(requester: ServerUser, session: CoachingSession) {
  if (session.advisorId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new CoachingApiError('Forbidden', 403);
  }
}

function sanitizeObject<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function coachingEntityKey(entityType: 'client' | 'prospect', entityId: string) {
  return `${entityType}_${entityId}`;
}

function buildActiveIndex(session: CoachingSession): CoachingActiveIndex {
  const entities =
    session.status === 'Open'
      ? (session.items || []).reduce((acc, item) => {
          if (
            (item.entityType === 'client' || item.entityType === 'prospect') &&
            item.entityId &&
            item.status !== 'Cancelado'
          ) {
            acc[coachingEntityKey(item.entityType, item.entityId)] = {
              entityType: item.entityType,
              entityId: item.entityId,
              entityName: item.entityName,
              sessionId: session.id,
              itemId: item.id,
              status: item.status,
              lastUpdate: item.lastUpdate || item.originalCreatedAt,
            };
          }
          return acc;
        }, {} as Record<string, CoachingActiveIndexEntry>)
      : {};

  return {
    advisorId: session.advisorId,
    advisorName: session.advisorName,
    openSessionId: session.status === 'Open' ? session.id : undefined,
    updatedAt: new Date().toISOString(),
    entities,
  };
}

async function saveActiveIndex(index: CoachingActiveIndex) {
  const payload: Record<string, unknown> = {
    advisorId: index.advisorId,
    entities: index.entities || {},
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (index.advisorName) payload.advisorName = index.advisorName;
  payload.openSessionId = index.openSessionId || FieldValue.delete();

  await dbAdmin.collection('coaching_active_index').doc(index.advisorId).set(payload, { merge: true });
}

async function syncActiveIndex(session: CoachingSession) {
  await saveActiveIndex(buildActiveIndex(session));
}

function normalizeSession(id: string, data: FirebaseFirestore.DocumentData | undefined): CoachingSession {
  return serializeDocument<CoachingSession>(id, data);
}

export async function listCoachingSessions(
  advisorId: string,
  requester: ServerUser,
): Promise<CoachingSession[]> {
  if (!advisorId) throw new CoachingApiError('advisorId es obligatorio.', 400);
  if (advisorId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new CoachingApiError('Forbidden', 403);
  }

  const snapshot = await dbAdmin
    .collection('coaching_sessions')
    .where('advisorId', '==', advisorId)
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map(doc => normalizeSession(doc.id, doc.data()));
}

export async function createCoachingSessionServer(
  sessionData: Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<string> {
  if (!sessionData?.advisorId) throw new CoachingApiError('advisorId es obligatorio.', 400);
  if (sessionData.advisorId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new CoachingApiError('Forbidden', 403);
  }

  const preparedItems = (sessionData.items || []).map(item => ({
    ...item,
    id: item.id || newId(),
    taskId: item.taskId || newId(),
    originalCreatedAt: item.originalCreatedAt || new Date().toISOString(),
  }));

  const docRef = await dbAdmin.collection('coaching_sessions').add({
    ...sessionData,
    status: 'Open',
    createdAt: FieldValue.serverTimestamp(),
    items: preparedItems,
  });

  await syncActiveIndex({
    ...sessionData,
    id: docRef.id,
    status: 'Open',
    createdAt: new Date().toISOString(),
    items: preparedItems,
  });

  await logServerActivity({
    userId: userId || requester.uid,
    userName: userName || requester.name || requester.email || 'Usuario',
    type: 'create',
    entityType: 'user',
    entityId: sessionData.advisorId,
    entityName: 'Sesion de Seguimiento',
    details: `inicio una nueva sesion de seguimiento para <strong>${sessionData.advisorName}</strong>`,
    ownerName: sessionData.advisorName,
  });

  return docRef.id;
}

export async function deleteCoachingSessionServer(
  sessionId: string,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<void> {
  const docRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  const snap = await docRef.get();
  if (!snap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

  const session = normalizeSession(snap.id, snap.data());
  assertCanAccessSession(requester, session);

  await docRef.delete();
  await syncActiveIndex({ ...session, status: 'Closed', items: [] });

  await logServerActivity({
    userId: userId || requester.uid,
    userName: userName || requester.name || requester.email || 'Usuario',
    type: 'delete',
    entityType: 'user',
    entityId: sessionId,
    entityName: 'Sesion de Seguimiento',
    details: 'elimino una sesion de seguimiento',
    ownerName: 'Sistema',
  });
}

export async function updateCoachingSessionServer(
  sessionId: string,
  data: Partial<CoachingSession>,
  requester: ServerUser,
): Promise<void> {
  const docRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  const snap = await docRef.get();
  if (!snap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

  const previous = normalizeSession(snap.id, snap.data());
  assertCanAccessSession(requester, previous);

  const { id: _ignoredId, ...rawData } = data || {};
  const cleanData = sanitizeObject(rawData as Record<string, unknown>);
  await docRef.update(cleanData);
  await syncActiveIndex({ ...previous, ...cleanData } as CoachingSession);
}

export async function updateCoachingItemServer(
  sessionId: string,
  itemId: string,
  updates: Partial<CoachingItem>,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<void> {
  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;
  let shouldLogCompleted = false;

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    const now = new Date().toISOString();
    let itemFound = false;
    const updatedItems = (session.items || []).map(item => {
      if (item.id !== itemId) return item;
      itemFound = true;
      shouldLogCompleted = updates.status === 'Completado';
      return { ...item, ...updates, lastUpdate: now };
    });

    if (!itemFound) throw new CoachingApiError('Item de seguimiento no encontrado.', 404);
    transaction.update(sessionRef, { items: updatedItems });
    updatedSession = { ...session, items: updatedItems };
  });

  if (updatedSession) await syncActiveIndex(updatedSession);

  if (shouldLogCompleted && updatedSession) {
    await logServerActivity({
      userId: userId || requester.uid,
      userName: userName || requester.name || requester.email || 'Usuario',
      type: 'update',
      entityType: 'user',
      entityId: sessionId,
      entityName: 'Tarea de Seguimiento',
      details: 'completo una tarea de la sesion de seguimiento.',
      ownerName: updatedSession.advisorName,
    });
  }
}

export async function deleteCoachingItemServer(
  sessionId: string,
  itemId: string,
  requester: ServerUser,
): Promise<void> {
  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    const updatedItems = (session.items || []).filter(item => item.id !== itemId);
    if (updatedItems.length === (session.items || []).length) {
      throw new CoachingApiError('Item de seguimiento no encontrado.', 404);
    }

    transaction.update(sessionRef, { items: updatedItems });
    updatedSession = { ...session, items: updatedItems };
  });

  if (updatedSession) await syncActiveIndex(updatedSession);
}

export async function addItemsToSessionServer(
  sessionId: string,
  newItems: CoachingItem[],
  requester: ServerUser,
): Promise<void> {
  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    let currentItems = [...(session.items || [])];
    let hasChanges = false;

    (newItems || []).forEach(newItem => {
      const existingItemIndex = currentItems.findIndex(
        item => item.entityId === newItem.entityId && item.status !== 'Cancelado',
      );

      if (existingItemIndex >= 0) {
        const existingItem = currentItems[existingItemIndex];
        const now = new Date().toISOString();
        const newEntry = {
          id: newId(),
          text: newItem.action,
          createdAt: now,
          createdById: session.advisorId,
          createdByName: session.advisorName,
        };

        currentItems[existingItemIndex] = {
          ...existingItem,
          action:
            newItem.origin === 'manager'
              ? existingItem.action
                ? `${existingItem.action}\n\n${newItem.action}`
                : newItem.action
              : existingItem.action,
          followUpDoneEntries:
            newItem.origin === 'advisor'
              ? [...(existingItem.followUpDoneEntries || []), newEntry]
              : existingItem.followUpDoneEntries,
          followUpDoneUpdatedAt:
            newItem.origin === 'advisor' ? now : existingItem.followUpDoneUpdatedAt,
          lastUpdate: now,
        };
        hasChanges = true;
      } else {
        currentItems.push({
          ...newItem,
          id: newItem.id || newId(),
          taskId: newItem.taskId || newId(),
          originalCreatedAt: newItem.originalCreatedAt || new Date().toISOString(),
        });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      transaction.update(sessionRef, { items: currentItems });
      updatedSession = { ...session, items: currentItems };
    }
  });

  if (updatedSession) await syncActiveIndex(updatedSession);
}

export async function appendCoachingFollowUpEntryServer(
  sessionId: string,
  itemId: string,
  field: FollowUpField,
  text: string,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<CoachingFollowUpEntry | null> {
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;
  let createdEntry: CoachingFollowUpEntry | null = null;

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    const now = new Date().toISOString();
    const entriesField = `${field}Entries` as
      | 'followUpDoneEntries'
      | 'followUpCurrentEntries'
      | 'followUpNextEntries';
    const updatedAtField = `${field}UpdatedAt` as
      | 'followUpDoneUpdatedAt'
      | 'followUpCurrentUpdatedAt'
      | 'followUpNextUpdatedAt';
    let itemFound = false;

    const updatedItems = (session.items || []).map(item => {
      if (item.id !== itemId) return item;
      itemFound = true;
      createdEntry = {
        id: newId(),
        text: trimmedText,
        createdAt: now,
        createdById: userId || requester.uid,
        createdByName: userName || requester.name || requester.email || 'Usuario',
      };

      return {
        ...item,
        [entriesField]: [...(item[entriesField] || []), createdEntry],
        [updatedAtField]: now,
        lastUpdate: now,
      };
    });

    if (!itemFound) throw new CoachingApiError('Item de seguimiento no encontrado.', 404);
    transaction.update(sessionRef, { items: updatedItems });
    updatedSession = { ...session, items: updatedItems };
  });

  if (updatedSession) await syncActiveIndex(updatedSession);
  return createdEntry;
}

export async function updateCoachingFollowUpEntryServer(
  sessionId: string,
  itemId: string,
  field: FollowUpField,
  entryId: string,
  text: string,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText) throw new CoachingApiError('El asiento no puede quedar vacio.', 400);

  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;
  let advisorName = '';

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    const now = new Date().toISOString();
    const entriesField = `${field}Entries` as
      | 'followUpDoneEntries'
      | 'followUpCurrentEntries'
      | 'followUpNextEntries';
    const updatedAtField = `${field}UpdatedAt` as
      | 'followUpDoneUpdatedAt'
      | 'followUpCurrentUpdatedAt'
      | 'followUpNextUpdatedAt';
    let entryFound = false;

    const updatedItems = (session.items || []).map(item => {
      if (item.id !== itemId) return item;
      const entries = (item[entriesField] || []).map(entry => {
        if (entry.id !== entryId) return entry;
        entryFound = true;
        return {
          ...entry,
          text: trimmedText,
          updatedAt: now,
          updatedById: userId || requester.uid,
          updatedByName: userName || requester.name || requester.email || 'Usuario',
        };
      });
      return { ...item, [entriesField]: entries, [updatedAtField]: now, lastUpdate: now };
    });

    if (!entryFound) throw new CoachingApiError('Asiento de seguimiento no encontrado.', 404);
    transaction.update(sessionRef, { items: updatedItems });
    advisorName = session.advisorName;
    updatedSession = { ...session, items: updatedItems };
  });

  if (updatedSession) await syncActiveIndex(updatedSession);

  await logServerActivity({
    userId: userId || requester.uid,
    userName: userName || requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'user',
    entityId: sessionId,
    entityName: 'Bitacora de seguimiento',
    details: 'edito un asiento de seguimiento.',
    ownerName: advisorName,
  });
}

export async function deleteCoachingFollowUpEntryServer(
  sessionId: string,
  itemId: string,
  field: FollowUpField,
  entryId: string,
  userId: string,
  userName: string,
  requester: ServerUser,
): Promise<void> {
  const sessionRef = dbAdmin.collection('coaching_sessions').doc(sessionId);
  let updatedSession: CoachingSession | null = null;
  let advisorName = '';

  await dbAdmin.runTransaction(async transaction => {
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) throw new CoachingApiError('Sesion no encontrada.', 404);

    const session = normalizeSession(sessionSnap.id, sessionSnap.data());
    assertCanAccessSession(requester, session);

    const now = new Date().toISOString();
    const entriesField = `${field}Entries` as
      | 'followUpDoneEntries'
      | 'followUpCurrentEntries'
      | 'followUpNextEntries';
    const updatedAtField = `${field}UpdatedAt` as
      | 'followUpDoneUpdatedAt'
      | 'followUpCurrentUpdatedAt'
      | 'followUpNextUpdatedAt';
    let entryFound = false;

    const updatedItems = (session.items || []).map(item => {
      if (item.id !== itemId) return item;
      const previousEntries = item[entriesField] || [];
      const entries = previousEntries.filter(entry => entry.id !== entryId);
      entryFound = entries.length !== previousEntries.length;
      return { ...item, [entriesField]: entries, [updatedAtField]: now, lastUpdate: now };
    });

    if (!entryFound) throw new CoachingApiError('Asiento de seguimiento no encontrado.', 404);
    transaction.update(sessionRef, { items: updatedItems });
    advisorName = session.advisorName;
    updatedSession = { ...session, items: updatedItems };
  });

  if (updatedSession) await syncActiveIndex(updatedSession);

  await logServerActivity({
    userId: userId || requester.uid,
    userName: userName || requester.name || requester.email || 'Usuario',
    type: 'delete',
    entityType: 'user',
    entityId: sessionId,
    entityName: 'Bitacora de seguimiento',
    details: 'elimino un asiento de seguimiento.',
    ownerName: advisorName,
  });
}
