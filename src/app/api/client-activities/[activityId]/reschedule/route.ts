import { NextResponse } from 'next/server';
import { activityErrorResponse } from '@/app/api/activities/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { rescheduleClientActivityServer } from '@/lib/server/client-activities';

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { activityId } = await context.params;
    const body = await request.json();
    await rescheduleClientActivityServer(activityId, body?.dueDate);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CLIENT ACTIVITY RESCHEDULE',
      requesterId: requester.uid,
      publicError: 'No se pudo reprogramar la tarea.',
    });
  }
}
