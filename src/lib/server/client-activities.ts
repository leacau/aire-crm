import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ClientActivity, Opportunity, Prospect } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

export class ClientActivityApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


function mapClientActivity(id: string, data: FirebaseFirestore.DocumentData | undefined): ClientActivity {
  return serializeDocument<ClientActivity>(id, data);
}

async function requesterOwnsClient(clientId: string | undefined, requester: ServerUser): Promise<boolean> {
  if (!clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

async function requesterOwnsProspect(prospectId: string | undefined, requester: ServerUser): Promise<boolean> {
  if (!prospectId) return false;

  const prospectSnap = await dbAdmin.collection('prospects').doc(prospectId).get();
  if (!prospectSnap.exists) return false;

  const prospect = serializeDocument<Prospect>(prospectSnap.id, prospectSnap.data());
  return prospect.ownerId === requester.uid;
}

async function requesterOwnsOpportunity(opportunityId: string | undefined, requester: ServerUser): Promise<boolean> {
  if (!opportunityId || opportunityId === 'none') return false;

  const opportunitySnap = await dbAdmin.collection('opportunities').doc(opportunityId).get();
  if (!opportunitySnap.exists) return false;

  const opportunity = serializeDocument<Opportunity>(opportunitySnap.id, opportunitySnap.data());
  return opportunity.ownerId === requester.uid || await requesterOwnsClient(opportunity.clientId, requester);
}

async function canAccessClientActivity(activity: ClientActivity, requester: ServerUser): Promise<boolean> {
  if (hasServerManagementPrivileges(requester)) return true;
  if (activity.userId === requester.uid) return true;
  if (await requesterOwnsClient(activity.clientId, requester)) return true;
  if (await requesterOwnsProspect(activity.prospectId, requester)) return true;
  return requesterOwnsOpportunity(activity.opportunityId, requester);
}

async function requireActivityTargetAccess(
  activity: Partial<ClientActivity>,
  requester: ServerUser,
): Promise<void> {
  if (hasServerManagementPrivileges(requester)) return;

  const hasScopedTarget = Boolean(
    activity.clientId
    || activity.prospectId
    || (activity.opportunityId && activity.opportunityId !== 'none'),
  );
  if (!hasScopedTarget) return;

  const canAccessTarget =
    await requesterOwnsClient(activity.clientId, requester)
    || await requesterOwnsProspect(activity.prospectId, requester)
    || await requesterOwnsOpportunity(activity.opportunityId, requester);

  if (!canAccessTarget) {
    throw new ClientActivityApiError('Forbidden', 403);
  }
}

async function getClientActivityOrFail(activityId: string): Promise<ClientActivity> {
  const activitySnap = await dbAdmin.collection('client-activities').doc(activityId).get();
  if (!activitySnap.exists) {
    throw new ClientActivityApiError('Actividad no encontrada.', 404);
  }
  return mapClientActivity(activitySnap.id, activitySnap.data());
}

async function requireActivityAccess(activity: ClientActivity, requester: ServerUser): Promise<void> {
  if (!(await canAccessClientActivity(activity, requester))) {
    throw new ClientActivityApiError('Forbidden', 403);
  }
}

function buildClientActivityCreatePayload(
  activityData: Omit<ClientActivity, 'id' | 'timestamp'>,
  requesterId: string,
  requesterName: string,
) {
  const dataToSave: Record<string, unknown> = {
    ...activityData,
    userId: requesterId,
    userName: requesterName,
    timestamp: FieldValue.serverTimestamp(),
  };

  if (activityData.isTask && activityData.dueDate) {
    dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
  } else {
    delete dataToSave.dueDate;
  }

  if (!activityData.opportunityId || activityData.opportunityId === 'none') {
    delete dataToSave.opportunityId;
    delete dataToSave.opportunityTitle;
  }

  if (!activityData.clientId) delete dataToSave.clientId;
  if (!activityData.clientName) delete dataToSave.clientName;
  if (!activityData.prospectId) delete dataToSave.prospectId;
  if (!activityData.prospectName) delete dataToSave.prospectName;

  return Object.fromEntries(
    Object.entries(dataToSave).filter(([, value]) => value !== undefined),
  );
}

function buildActivityUpdate(data: Partial<Omit<ClientActivity, 'id'>>, requester: ServerUser) {
  const {
    userId: _userId,
    userName: _userName,
    timestamp: _timestamp,
    completedAt: _completedAt,
    completedByUserId: _completedByUserId,
    completedByUserName: _completedByUserName,
    ...safeData
  } = data;
  const updateData: Record<string, unknown> = {
    ...safeData,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.completed) {
    updateData.completedAt = FieldValue.serverTimestamp();
    updateData.completedByUserId = requester.uid;
    updateData.completedByUserName = getRequesterName(requester);
  } else if (data.completed === false) {
    updateData.completedAt = FieldValue.delete();
    updateData.completedByUserId = FieldValue.delete();
    updateData.completedByUserName = FieldValue.delete();
  }

  if (data.dueDate) {
    updateData.dueDate = Timestamp.fromDate(new Date(data.dueDate));
  }

  if (data.googleCalendarEventId === null) {
    updateData.googleCalendarEventId = FieldValue.delete();
  }

  return Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== undefined),
  );
}

export async function listClientActivitiesServer(
  tasksOnly: boolean,
  requester: ServerUser,
): Promise<ClientActivity[]> {
  let query: FirebaseFirestore.Query = dbAdmin.collection('client-activities');

  if (tasksOnly) {
    query = query.where('isTask', '==', true);
  }

  const snapshot = await query.orderBy('timestamp', 'desc').get();
  const activities = snapshot.docs.map(doc => mapClientActivity(doc.id, doc.data()));

  if (hasServerManagementPrivileges(requester)) return activities;

  const accessResults = await Promise.all(
    activities.map(activity => canAccessClientActivity(activity, requester)),
  );
  return activities.filter((_, index) => accessResults[index]);
}

export async function createClientActivityServer(
  rawActivityData: unknown,
  requester: ServerUser,
): Promise<string> {
  const activityData = rawActivityData as Omit<ClientActivity, 'id' | 'timestamp'> | undefined;

  if (!activityData?.type || !activityData.observation?.trim()) {
    throw new ClientActivityApiError('Tipo y observacion son obligatorios.', 400);
  }

  await requireActivityTargetAccess(activityData, requester);

  const docRef = await dbAdmin.collection('client-activities').add(
    buildClientActivityCreatePayload(activityData, requester.uid, getRequesterName(requester)),
  );

  return docRef.id;
}

export async function updateClientActivityServer(
  activityId: string,
  rawData: unknown,
  requester: ServerUser,
): Promise<void> {
  const data = (rawData || {}) as Partial<Omit<ClientActivity, 'id'>>;
  const activity = await getClientActivityOrFail(activityId);
  await requireActivityAccess(activity, requester);
  await requireActivityTargetAccess({ ...activity, ...data }, requester);

  await dbAdmin.collection('client-activities').doc(activityId).update(buildActivityUpdate(data, requester));
}

export async function completeClientActivityServer(
  activityId: string,
  requester: ServerUser,
): Promise<void> {
  const activity = await getClientActivityOrFail(activityId);
  await requireActivityAccess(activity, requester);

  const requesterName = getRequesterName(requester);

  await dbAdmin.collection('client-activities').doc(activityId).update({
    completed: true,
    completedAt: FieldValue.serverTimestamp(),
    completedByUserId: requester.uid,
    completedByUserName: requesterName,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'client_activity' as any,
    entityId: activityId,
    entityName: 'Tarea completada',
    details: 'marco la tarea como finalizada',
    ownerName: requesterName,
  });
}

export async function rescheduleClientActivityServer(
  activityId: string,
  rawDueDate: unknown,
  requester: ServerUser,
): Promise<void> {
  const dueDate = rawDueDate ? new Date(String(rawDueDate)) : null;

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    throw new ClientActivityApiError('Fecha invalida.', 400);
  }

  const activity = await getClientActivityOrFail(activityId);
  await requireActivityAccess(activity, requester);

  await dbAdmin.collection('client-activities').doc(activityId).update({
    dueDate: Timestamp.fromDate(dueDate),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function cleanupOldClientActivitiesServer(): Promise<number> {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const snapshot = await dbAdmin
    .collection('client-activities')
    .where('completed', '==', true)
    .where('completedAt', '<', sixtyDaysAgo.toISOString())
    .limit(100)
    .get();

  if (snapshot.empty) return 0;

  const batch = dbAdmin.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return snapshot.size;
}
