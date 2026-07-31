import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  NotificationApiError,
  sendNotificationToUsersServer,
} from '@/lib/server/notifications';
import { routeApiErrorResponse, routeErrorResponse } from '@/lib/server/route-errors';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json(await sendNotificationToUsersServer(body, requester));
  } catch (error) {
    if (error instanceof NotificationApiError) return routeApiErrorResponse(error);
    return routeErrorResponse(error, 'NOTIFICATIONS', {
      action: 'SEND',
      requesterId: requester.uid,
      publicError: 'No se pudo enviar la notificacion.',
    });
  }
}
