import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  NotificationApiError,
  registerNotificationTokenServer,
  unregisterNotificationTokenServer,
} from '@/lib/server/notifications';
import { routeApiErrorResponse, routeErrorResponse } from '@/lib/server/route-errors';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json(await registerNotificationTokenServer(body, requester));
  } catch (error) {
    if (error instanceof NotificationApiError) return routeApiErrorResponse(error);
    return routeErrorResponse(error, 'NOTIFICATIONS', {
      action: 'REGISTER_TOKEN',
      requesterId: requester.uid,
      publicError: 'No se pudo registrar el dispositivo para notificaciones.',
    });
  }
}

export async function DELETE(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json().catch(() => ({}));
    await unregisterNotificationTokenServer(body?.token, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NotificationApiError) return routeApiErrorResponse(error);
    return routeErrorResponse(error, 'NOTIFICATIONS', {
      action: 'UNREGISTER_TOKEN',
      requesterId: requester.uid,
      publicError: 'No se pudo desregistrar el dispositivo para notificaciones.',
    });
  }
}
