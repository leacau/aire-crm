import { NextResponse } from 'next/server';
import { activityErrorResponse } from '@/app/api/activities/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  createActivityServer,
  getClientGraphActivitiesServer,
  listActivitiesServer,
  parseActivityLimit,
} from '@/lib/server/activity';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const activityLimit = parseActivityLimit(searchParams.get('limit'), 20);

    if (scope === 'client-graph') {
      if (!entityId) return NextResponse.json({ activities: [] });
      return NextResponse.json({ activities: await getClientGraphActivitiesServer(entityId) });
    }

    return NextResponse.json({
      activities: await listActivitiesServer({ entityType, entityId, limit: activityLimit }),
    });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las actividades.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await createActivityServer(body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo registrar la actividad.',
    });
  }
}
