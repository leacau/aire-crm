import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import type { ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ClientActivity } from '@/lib/types';
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

function buildActivityUpdate(data: Partial<Omit<ClientActivity, 'id'>>) {
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.completed) {
    updateData.completedAt = FieldValue.serverTimestamp();
    updateData.completedByUserId = data.completedByUserId;
    updateData.completedByUserName = data.completedByUserName;
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

export async function listClientActivitiesServer(tasksOnly: boolean): Promise<ClientActivity[]> {
  let query: FirebaseFirestore.Query = dbAdmin.collection('client-activities');

  if (tasksOnly) {
    query = query.where('isTask', '==', true);
  }

  const snapshot = await query.orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => mapClientActivity(doc.id, doc.data()));
}

export async function createClientActivityServer(
  rawActivityData: unknown,
  requester: ServerUser,
): Promise<string> {
  const activityData = rawActivityData as Omit<ClientActivity, 'id' | 'timestamp'> | undefined;

  if (!activityData?.type || !activityData.observation?.trim()) {
    throw new ClientActivityApiError('Tipo y observacion son obligatorios.', 400);
  }

  const docRef = await dbAdmin.collection('client-activities').add(
    buildClientActivityCreatePayload(activityData, requester.uid, getRequesterName(requester)),
  );

  return docRef.id;
}

export async function updateClientActivityServer(
  activityId: string,
  rawData: unknown,
): Promise<void> {
  const data = (rawData || {}) as Partial<Omit<ClientActivity, 'id'>>;
  await dbAdmin.collection('client-activities').doc(activityId).update(buildActivityUpdate(data));
}

export async function completeClientActivityServer(
  activityId: string,
  requester: ServerUser,
): Promise<void> {
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
): Promise<void> {
  const dueDate = rawDueDate ? new Date(String(rawDueDate)) : null;

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    throw new ClientActivityApiError('Fecha invalida.', 400);
  }

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