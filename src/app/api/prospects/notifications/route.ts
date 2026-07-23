import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { registerProspectNotificationsServer } from '@/lib/server/prospects';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await registerProspectNotificationsServer(body?.prospectIds, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'NOTIFICATIONS',
      requesterId: requester.uid,
      publicError: 'No se pudieron registrar las notificaciones de prospectos.',
    });
  }
}
