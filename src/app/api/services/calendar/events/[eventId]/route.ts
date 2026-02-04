import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId } = await params;
    try {
        const { accessToken, event, calendarId = 'primary' } = await req.json();

        if (!accessToken) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
            method: 'PATCH',
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

        return NextResponse.json(await response.json());
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
    const { eventId } = await params;
    try {
        // Necesitamos obtener el token del header o body. DELETE body no es standard pero Next lo permite,
        // o mejor usar Headers. Aquí asumimos que el cliente lo manda en un header custom para simplificar o body.
        // Dado que fetch client-side permite body en DELETE en muchos casos, probamos leer json.
        // Si falla, intentamos headers.
        
        let accessToken = '';
        try {
            const body = await req.json();
            accessToken = body.accessToken;
        } catch {
             // Fallback to header
             const authHeader = req.headers.get('Authorization');
             if(authHeader) accessToken = authHeader.replace('Bearer ', '');
        }

        if (!accessToken) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
        
        // Obtener calendarId del query param si es necesario, default primary
        const { searchParams } = new URL(req.url);
        const calendarId = searchParams.get('calendarId') || 'primary';

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        });

        if (!response.ok && response.status !== 404 && response.status !== 410) {
            const errorData = await response.json();
            return NextResponse.json(errorData, { status: response.status });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
