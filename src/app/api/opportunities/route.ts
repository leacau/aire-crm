import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { parseISO } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { cleanObject, getRequesterName, mapClient } from '@/app/api/clients/utils';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerUser,
} from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
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

  try {
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
  } catch (error: any) {
    console.error('OPPORTUNITIES LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las oportunidades.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const opportunityData = body?.opportunityData as Omit<Opportunity, 'id'> | undefined;

    if (!opportunityData?.clientId || !opportunityData.title) {
      return NextResponse.json({ error: 'Cliente y titulo son obligatorios.' }, { status: 400 });
    }

    if (opportunityData.stage === 'Cerrado - Ganado') {
      if (!opportunityData.startDate || !opportunityData.endDate) {
        return NextResponse.json(
          { error: 'La vigencia del contrato es obligatoria para cerrar una oportunidad como ganada.' },
          { status: 400 },
        );
      }
      if (parseISO(opportunityData.endDate) < parseISO(opportunityData.startDate)) {
        return NextResponse.json(
          { error: 'La fecha de fin del contrato no puede ser anterior a la fecha de inicio.' },
          { status: 400 },
        );
      }
    }

    const clientSnap = await dbAdmin.collection('clients').doc(opportunityData.clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: 'Cliente no encontrado para crear la oportunidad.' }, { status: 404 });
    }

    const client = mapClient(clientSnap.id, clientSnap.data());
    if (!hasServerManagementPrivileges(requester) && client.ownerId !== requester.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dataToSave = cleanObject({
      ...(opportunityData as unknown as Record<string, unknown>),
      pautados: undefined,
      createdAt: FieldValue.serverTimestamp(),
      stageChangedAt: FieldValue.serverTimestamp(),
    });

    const docRef = await dbAdmin.collection('opportunities').add(dataToSave);
    const requesterName = getRequesterName(requester);

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'opportunity',
      entityId: docRef.id,
      entityName: opportunityData.title,
      details: `creo la oportunidad <strong>${opportunityData.title}</strong> para el cliente <a href="/clients/${opportunityData.clientId}" class="font-bold text-primary hover:underline">${opportunityData.clientName}</a>`,
      ownerName: client.ownerName,
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error: any) {
    console.error('OPPORTUNITY CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear la oportunidad.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
