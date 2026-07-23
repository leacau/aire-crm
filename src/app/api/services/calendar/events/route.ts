import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { externalServiceErrorResponse } from '@/app/api/services/utils';

function encodeCalendarId(calendarId: string) {
    return encodeURIComponent(calendarId || 'primary');
}

export async function GET(req: Request) {
    try {
        const serverUser = await requireServerUser(req);
        if (isServerResponse(serverUser)) return serverUser;

        const { searchParams } = new URL(req.url);
        const accessToken = req.headers.get('x-google-access-token');
        const calendarId = searchParams.get('calendarId') || 'primary';

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
        }

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeCalendarId(calendarId)}/events?maxResults=2500&singleEvents=true&orderBy=startTime`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(errorData, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json({ items: Array.isArray(data.items) ? data.items : [] });
    } catch (error) {
        return externalServiceErrorResponse(error, {
            service: 'GOOGLE CALENDAR',
            action: 'LIST EVENTS',
            publicError: 'No se pudieron cargar los eventos de Google Calendar.',
        });
    }
}

export async function POST(req: Request) {
    try {
        const serverUser = await requireServerUser(req);
        if (isServerResponse(serverUser)) return serverUser;

        const { accessToken, event, calendarId = 'primary' } = await req.json();

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
        }

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeCalendarId(calendarId)}/events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.json(errorData, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return externalServiceErrorResponse(error, {
            service: 'GOOGLE CALENDAR',
            action: 'CREATE EVENT',
            publicError: 'No se pudo crear el evento en Google Calendar.',
        });
    }
}
