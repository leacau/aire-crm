import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
