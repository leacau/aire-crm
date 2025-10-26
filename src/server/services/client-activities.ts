import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import type { ClientActivity } from '@/lib/types';

import { adminDb } from '../firebase-admin';

const clientActivitiesCollection = adminDb.collection('client-activities');

const toClientActivity = (doc: QueryDocumentSnapshot): ClientActivity => {
  const data = doc.data();
  const activity: Record<string, unknown> = {
    id: doc.id,
    ...data,
    timestamp:
      data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp,
  };

  if (data.dueDate instanceof Timestamp) {
    activity.dueDate = data.dueDate.toDate().toISOString();
  }

  if (data.completedAt instanceof Timestamp) {
    activity.completedAt = data.completedAt.toDate().toISOString();
  }

  return activity as ClientActivity;
};

export type CreateClientActivityInput = Omit<ClientActivity, 'id' | 'timestamp'>;
export type UpdateClientActivityInput = Partial<Omit<ClientActivity, 'id'>>;

export async function listClientActivities(clientId?: string): Promise<ClientActivity[]> {
  const baseQuery = clientId
    ? clientActivitiesCollection.where('clientId', '==', clientId)
    : clientActivitiesCollection;
  const snapshot = await baseQuery.orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(toClientActivity);
}

export async function createClientActivity(data: CreateClientActivityInput): Promise<string> {
  const payload: Record<string, unknown> = {
    ...data,
    timestamp: FieldValue.serverTimestamp(),
  };

  if (!(data.opportunityId && data.opportunityId !== 'none')) {
    delete payload.opportunityId;
    delete payload.opportunityTitle;
  }

  if (data.isTask && data.dueDate) {
    payload.dueDate = Timestamp.fromDate(new Date(data.dueDate));
  } else {
    delete payload.dueDate;
  }

  const docRef = await clientActivitiesCollection.add(payload);
  return docRef.id;
}

export async function updateClientActivity(
  id: string,
  data: UpdateClientActivityInput,
): Promise<void> {
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

  await clientActivitiesCollection.doc(id).update(updateData);
}
