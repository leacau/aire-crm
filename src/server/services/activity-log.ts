import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { ActivityLog } from '@/lib/types';
import { adminDb } from '../firebase-admin';

const activitiesCollection = adminDb.collection('activities');

export type LogActivityParams = {
  userId: string;
  userName: string;
  ownerName: string;
  type: ActivityLog['type'];
  entityType: ActivityLog['entityType'];
  entityId: string;
  entityName: string;
  details: string;
};

const toActivityLog = (snapshot: QueryDocumentSnapshot): ActivityLog => {
  const data = snapshot.data();
  const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp;
  return {
    id: snapshot.id,
    ...data,
    timestamp,
  } as ActivityLog;
};

export async function logActivity(params: LogActivityParams) {
  await activitiesCollection.add({
    ...params,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export async function listActivities(limit: number = 20): Promise<ActivityLog[]> {
  const snapshot = await activitiesCollection.orderBy('timestamp', 'desc').limit(limit).get();
  return snapshot.docs.map(toActivityLog);
}

export async function listActivitiesForEntity(entityId: string): Promise<ActivityLog[]> {
  const snapshot = await activitiesCollection
    .where('entityId', '==', entityId)
    .orderBy('timestamp', 'desc')
    .get();
  return snapshot.docs.map(toActivityLog);
}
