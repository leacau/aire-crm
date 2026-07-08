import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ObjectiveVisibilityConfig } from '@/lib/types';

const OBJECTIVE_VISIBILITY_DOC_ID = 'objective_visibility';

function normalizeConfig(rawConfig: unknown): ObjectiveVisibilityConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};
  const data = rawConfig as ObjectiveVisibilityConfig;
  return {
    activeMonthKey: typeof data.activeMonthKey === 'string' ? data.activeMonthKey : undefined,
    visibleUntil: typeof data.visibleUntil === 'string' ? data.visibleUntil : undefined,
    updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snap = await dbAdmin.collection('system_config').doc(OBJECTIVE_VISIBILITY_DOC_ID).get();
  const config = snap.exists
    ? normalizeConfig(serializeDocument<ObjectiveVisibilityConfig>(snap.id, snap.data()))
    : {};

  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const config = normalizeConfig(body?.config);

  await dbAdmin.collection('system_config').doc(OBJECTIVE_VISIBILITY_DOC_ID).set({
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByName: requester.name || requester.email || 'Usuario',
  }, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'system_config',
    entityId: OBJECTIVE_VISIBILITY_DOC_ID,
    entityName: 'Visibilidad de objetivos',
    details: 'actualizo la fecha de visibilidad de objetivos.',
    ownerName: requester.name || requester.email || 'Usuario',
  });

  return NextResponse.json({ config });
}
