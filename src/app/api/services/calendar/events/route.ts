import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { accessToken, event, calendarId = 'primary' } = await req.json();

        if (!accessToken) {
            return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
        }

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
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
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
