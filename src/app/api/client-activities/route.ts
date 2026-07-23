import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { activityErrorResponse } from '@/app/api/activities/errors';
import { createClientActivityServer, listClientActivitiesServer } from '@/lib/server/client-activities';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const tasksOnly = searchParams.get('tasks') === 'true';
    return NextResponse.json({ activities: await listClientActivitiesServer(tasksOnly) });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CLIENT ACTIVITIES LIST',
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
    return NextResponse.json({ id: await createClientActivityServer(body?.activityData, requester) });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CLIENT ACTIVITY CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la actividad.',
    });
  }
}
