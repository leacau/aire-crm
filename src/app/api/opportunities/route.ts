import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerUser,
} from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { Opportunity } from '@/lib/types';

function mapOpportunity(id: string, data: FirebaseFirestore.DocumentData | undefined): Opportunity {
  return serializeDocument<Opportunity>(id, data);
}

async function getActiveOpportunities() {
  const activeStages = ['Nuevo', 'Propuesta', 'Negociacion', 'Negociación', 'Negociacion a Aprobar', 'Negociación a Aprobar', 'Cerrado - No Definido', 'Cerrado - Ganado'];
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const snapshots = await Promise.all([
    ...activeStages.map(stage => dbAdmin.collection('opportunities').where('stage', '==', stage).get()),
    dbAdmin.collection('opportunities')
      .where('stage', '==', 'Cerrado - Perdido')
      .where('createdAt', '>=', threeMonthsAgo.toISOString())
      .get(),
  ]);

  const seen = new Set<string>();
  const opportunities: Opportunity[] = [];
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      opportunities.push(mapOpportunity(doc.id, doc.data()));
    });
  });

  return opportunities;
}

async function getAllOpportunities() {
  const snapshot = await dbAdmin.collection('opportunities').get();
  return snapshot.docs.map(doc => mapOpportunity(doc.id, doc.data()));
}

async function getOpportunitiesForUser(userId: string) {
  const clientsSnap = await dbAdmin.collection('clients').where('ownerId', '==', userId).get();
  const clientIds = clientsSnap.docs.map(doc => doc.id);
  if (clientIds.length === 0) return [];

  const opportunities: Opportunity[] = [];
  for (let index = 0; index < clientIds.length; index += 30) {
    const chunk = clientIds.slice(index, index + 30);
    const snapshot = await dbAdmin.collection('opportunities').where('clientId', 'in', chunk).get();
    opportunities.push(...snapshot.docs.map(doc => mapOpportunity(doc.id, doc.data())));
  }

  return opportunities;
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'active';

  if (scope === 'all') {
    if (!hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ opportunities: await getAllOpportunities() });
  }

  if (scope === 'user') {
    const userId = searchParams.get('userId') || requester.uid;
    if (userId !== requester.uid && !hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ opportunities: await getOpportunitiesForUser(userId) });
  }

  return NextResponse.json({ opportunities: await getActiveOpportunities() });
}

