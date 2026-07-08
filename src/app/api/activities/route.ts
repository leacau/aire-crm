import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ActivityLog } from '@/lib/types';

function mapActivity(id: string, data: FirebaseFirestore.DocumentData | undefined): ActivityLog {
  return serializeDocument<ActivityLog>(id, data);
}

function compareActivitiesDesc(a: ActivityLog, b: ActivityLog) {
  return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
}

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 200);
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

async function getClientGraphActivities(clientId: string) {
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

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const activityLimit = parseLimit(searchParams.get('limit'), 20);

  if (scope === 'client-graph') {
    if (!entityId) return NextResponse.json({ activities: [] });
    return NextResponse.json({ activities: await getClientGraphActivities(entityId) });
  }

  if (entityType && entityId) {
    const snapshot = await dbAdmin
      .collection('activities')
      .where('entityType', '==', entityType)
      .where('entityId', '==', entityId)
      .orderBy('timestamp', 'desc')
      .limit(activityLimit)
      .get();
    return NextResponse.json({ activities: snapshot.docs.map(doc => mapActivity(doc.id, doc.data())) });
  }

  const snapshot = await dbAdmin
    .collection('activities')
    .orderBy('timestamp', 'desc')
    .limit(activityLimit)
    .get();

  return NextResponse.json({ activities: snapshot.docs.map(doc => mapActivity(doc.id, doc.data())) });
}
