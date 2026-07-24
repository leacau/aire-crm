import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import type { ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ActivityLog } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

type LogActivityPayload = Omit<ActivityLog, 'id' | 'timestamp' | 'ownerName'> & {
  ownerName?: string;
  timestamp?: unknown;
};

export class ActivityApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


function mapActivity(id: string, data: FirebaseFirestore.DocumentData | undefined): ActivityLog {
  return serializeDocument<ActivityLog>(id, data);
}

function compareActivitiesDesc(a: ActivityLog, b: ActivityLog) {
  return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
}

export function parseActivityLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 200);
}

export async function logServerActivity(payload: LogActivityPayload): Promise<void> {
  try {
    await dbAdmin.collection('activities').add({
      ...payload,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error logging server activity:', error);
  }
}

async function getActivitiesForRefs(entityType: string, entityIds: string[]) {
  const activities: ActivityLog[] = [];
  const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));

  for (let index = 0; index < uniqueIds.length; index += 30) {
    const chunk = uniqueIds.slice(index, index + 30);
    if (chunk.length === 0) continue;
    const snapshot = await dbAdmin
      .collection('activities')
      .where('entityType', '==', entityType)
      .where('entityId', 'in', chunk)
      .get();
    activities.push(...snapshot.docs.map(doc => mapActivity(doc.id, doc.data())));
  }

  return activities;
}

export async function getClientGraphActivitiesServer(clientId: string) {
  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  if (!clientSnap.exists) return [];

  const [directClientSnap, opportunitiesSnap, peopleSnap] = await Promise.all([
    dbAdmin
      .collection('activities')
      .where('entityType', '==', 'client')
      .where('entityId', '==', clientId)
      .get(),
    dbAdmin.collection('opportunities').where('clientId', '==', clientId).get(),
    dbAdmin.collection('people').where('clientIds', 'array-contains', clientId).get(),
  ]);

  const opportunityIds = opportunitiesSnap.docs.map(doc => doc.id);
  const personIds = peopleSnap.docs.map(doc => doc.id);
  const [opportunityActivities, personActivities] = await Promise.all([
    getActivitiesForRefs('opportunity', opportunityIds),
    getActivitiesForRefs('person', personIds),
  ]);

  const activities = [
    ...directClientSnap.docs.map(doc => mapActivity(doc.id, doc.data())),
    ...opportunityActivities,
    ...personActivities,
  ];

  return activities.sort(compareActivitiesDesc);
}

export async function listActivitiesServer(params: {
  entityType?: string | null;
  entityId?: string | null;
  limit: number;
}) {
  const collectionRef = dbAdmin.collection('activities');

  if (params.entityType && params.entityId) {
    const filteredSnapshot = await collectionRef
      .where('entityType', '==', params.entityType)
      .where('entityId', '==', params.entityId)
      .orderBy('timestamp', 'desc')
      .limit(params.limit)
      .get();
    return filteredSnapshot.docs.map(doc => mapActivity(doc.id, doc.data()));
  }

  const latestSnapshot = await collectionRef
    .orderBy('timestamp', 'desc')
    .limit(params.limit)
    .get();

  return latestSnapshot.docs.map(doc => mapActivity(doc.id, doc.data()));
}

export async function createActivityServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};

  if (!body.type || !body.entityType || !body.entityId || !body.entityName || !body.details) {
    throw new ActivityApiError('Faltan datos para registrar la actividad.', 400);
  }

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: body.type as ActivityLog['type'],
    entityType: body.entityType as ActivityLog['entityType'],
    entityId: String(body.entityId),
    entityName: String(body.entityName),
    details: String(body.details),
    ownerName: body.ownerName ? String(body.ownerName) : undefined,
  });
}