import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { OpportunityAlertsConfig } from '@/lib/types';

const OPPORTUNITY_ALERTS_DOC_ID = 'opportunity_alerts';

function normalizeConfig(rawConfig: unknown): OpportunityAlertsConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  return Object.fromEntries(
    Object.entries(rawConfig as Record<string, unknown>)
      .map(([key, value]) => [key, Number(value)])
      .filter(([, value]) => Number.isFinite(value)),
  ) as OpportunityAlertsConfig;
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snap = await dbAdmin.collection('system_config').doc(OPPORTUNITY_ALERTS_DOC_ID).get();
  const config = snap.exists ? normalizeConfig(snap.data()) : {};

  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const config = normalizeConfig(body?.config);

  await dbAdmin.collection('system_config').doc(OPPORTUNITY_ALERTS_DOC_ID).set(config, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'opportunity_alerts_config',
    entityId: OPPORTUNITY_ALERTS_DOC_ID,
    entityName: 'Configuracion de Alertas de Oportunidades',
    details: 'actualizo la configuracion de alertas de oportunidades.',
    ownerName: requester.name || requester.email || 'Usuario',
  });

  return NextResponse.json({ config });
}
