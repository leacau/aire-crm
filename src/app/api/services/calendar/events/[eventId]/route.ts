import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { externalServiceErrorResponse } from '@/app/api/services/utils';

function encodeCalendarId(calendarId: string) {
  return encodeURIComponent(calendarId || 'primary');
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  try {
    const serverUser = await requireServerUser(req);
    if (isServerResponse(serverUser)) return serverUser;

    const { accessToken, event, calendarId = 'primary' } = await req.json();
    if (!accessToken) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(errorData, { status: response.status });
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return externalServiceErrorResponse(error, {
      service: 'GOOGLE CALENDAR',
      action: 'UPDATE EVENT',
      publicError: 'No se pudo actualizar el evento en Google Calendar.',
    });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  try {
    const serverUser = await requireServerUser(req);
    if (isServerResponse(serverUser)) return serverUser;

    const { accessToken, calendarId = 'primary' } = await req.json();
    if (!accessToken) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const errorData = await response.json();
      return NextResponse.json(errorData, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return externalServiceErrorResponse(error, {
      service: 'GOOGLE CALENDAR',
      action: 'DELETE EVENT',
      publicError: 'No se pudo eliminar el evento en Google Calendar.',
    });
  }
}
