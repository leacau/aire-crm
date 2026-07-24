import { NextResponse } from 'next/server';
import { listClientActivitiesServer } from '@/lib/server/client-activities';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const context = await requireMobileSession(request);
  if (isMobileSessionResponse(context)) return context;

  try {
    const activities = await listClientActivitiesServer(true, context.requester);
    return NextResponse.json({
      activities: activities.filter(activity => activity.isTask && !activity.completed),
    });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'TASKS',
      requesterId: context.requester.uid,
      publicError: 'No se pudieron cargar las tareas mobile.',
    });
  }
}
