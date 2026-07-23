import { NextResponse } from 'next/server';
import { activityErrorResponse } from '@/app/api/activities/errors';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { cleanupOldClientActivitiesServer } from '@/lib/server/client-activities';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ deleted: await cleanupOldClientActivitiesServer() });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CLIENT ACTIVITY CLEANUP',
      requesterId: requester.uid,
      publicError: 'No se pudo limpiar actividades antiguas.',
    });
  }
}
