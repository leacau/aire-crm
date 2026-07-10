import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { mapClient } from '@/app/api/clients/utils';
import { mapPaymentEntry } from '@/app/api/payments/utils';
import type { Client, CoachingSession, Opportunity, PaymentEntry, PaymentStatus, User } from '@/lib/types';

const ACTIVE_OPPORTUNITY_STAGES = [
  'Nuevo',
  'Propuesta',
  'Negociacion',
  'Negociación',
  'Negociacion a Aprobar',
  'Negociación a Aprobar',
  'Cerrado - No Definido',
  'Cerrado - Ganado',
];

const PENDING_PAYMENT_STATUSES: PaymentStatus[] = ['Pendiente', 'Reclamado', 'Incobrable'];

type AdvisorReportData = {
  advisor: User;
  opportunities: Opportunity[];
  payments: PaymentEntry[];
  coaching: CoachingSession | null;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getUsersByIds(userIds: string[]) {
  const users = new Map<string, User>();

  await Promise.all(userIds.map(async (userId) => {
    const snap = await dbAdmin.collection('users').doc(userId).get();
    if (snap.exists) {
      users.set(userId, serializeDocument<User>(snap.id, snap.data()));
    }
  }));

  return users;
}

async function getClientsForAdvisors(advisorIds: string[]) {
  const clients: Client[] = [];

  for (const advisorChunk of chunk(advisorIds, 30)) {
    const snapshot = await dbAdmin.collection('clients').where('ownerId', 'in', advisorChunk).get();
    clients.push(...snapshot.docs.map(doc => mapClient(doc.id, doc.data())));
  }

  return clients;
}

async function getActiveOpportunities() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const snapshots = await Promise.all([
    ...ACTIVE_OPPORTUNITY_STAGES.map(stage => dbAdmin.collection('opportunities').where('stage', '==', stage).get()),
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
      opportunities.push(serializeDocument<Opportunity>(doc.id, doc.data()));
    });
  });

  return opportunities;
}

async function getPendingPayments() {
  const snapshot = await dbAdmin
    .collection('payment_entries')
    .where('status', 'in', PENDING_PAYMENT_STATUSES)
    .get();

  return snapshot.docs.map(doc => mapPaymentEntry(doc.id, doc.data()));
}

async function getOpenCoachingSessions(advisorIds: string[]) {
  const sessions = new Map<string, CoachingSession>();

  await Promise.all(advisorIds.map(async (advisorId) => {
    const snapshot = await dbAdmin
      .collection('coaching_sessions')
      .where('advisorId', '==', advisorId)
      .where('status', '==', 'Open')
      .limit(1)
      .get();

    const first = snapshot.docs[0];
    if (first) {
      sessions.set(advisorId, serializeDocument<CoachingSession>(first.id, first.data()));
    }
  }));

  return sessions;
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json().catch(() => null);
  const rawAdvisorIds: string[] = Array.isArray(body?.advisorIds)
    ? body.advisorIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
    : [];
  const advisorIds = Array.from(new Set<string>(rawAdvisorIds));

  if (advisorIds.length === 0) {
    return NextResponse.json({ reports: [] });
  }

  if (!hasServerManagementPrivileges(requester) && (advisorIds.length > 1 || advisorIds[0] !== requester.uid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [usersById, clients, opportunities, payments, coachingByAdvisor] = await Promise.all([
    getUsersByIds(advisorIds),
    getClientsForAdvisors(advisorIds),
    getActiveOpportunities(),
    getPendingPayments(),
    getOpenCoachingSessions(advisorIds),
  ]);

  const clientsByAdvisor = clients.reduce((acc, client) => {
    if (!client.ownerId) return acc;
    if (!acc.has(client.ownerId)) acc.set(client.ownerId, []);
    acc.get(client.ownerId)!.push(client);
    return acc;
  }, new Map<string, Client[]>());

  const reports: AdvisorReportData[] = advisorIds.flatMap((advisorId) => {
    const advisor = usersById.get(advisorId);
    if (!advisor) return [];

    const clientIds = new Set((clientsByAdvisor.get(advisorId) || []).map(client => client.id));
    return [{
      advisor,
      opportunities: opportunities.filter(opportunity => clientIds.has(opportunity.clientId)),
      payments: payments.filter(payment => payment.advisorId === advisorId),
      coaching: coachingByAdvisor.get(advisorId) || null,
    }];
  });

  return NextResponse.json({ reports });
}
