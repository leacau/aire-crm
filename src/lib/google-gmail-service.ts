// src/lib/google-gmail-service.ts
// NOTA: No usamos 'use server' aquí. Esto corre en el cliente y llama a nuestras API Routes.

interface EmailAttachment {
    filename: string;
    content: string; // Base64 string
    encoding: 'base64';
}

interface EmailParams {
    accessToken?: string | null;
    to: string;
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
}

export async function sendEmail(params: EmailParams) {
    if (!params.accessToken) {
        console.warn("Skipping email send because accessToken is missing.");
        return;
    }

    const response = await fetch('/api/services/gmail/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send email: ${errorText}`);
    }

    return response.json();
}

export async function createCalendarEvent(accessToken: string, event: object, calendarId: string = 'primary') {
    const response = await fetch('/api/services/calendar/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken, event, calendarId }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create calendar event: ${errorText}`);
    }

    return response.json();
}

export async function updateCalendarEvent(accessToken: string, eventId: string, event: object, calendarId: string = 'primary') {
    const response = await fetch(`/api/services/calendar/events/${eventId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken, event, calendarId }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update calendar event: ${errorText}`);
    }

    return response.json();
}

export async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId: string = 'primary') {
    const response = await fetch(`/api/services/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            // Pasamos token en body si es posible, o header si tu server lo soporta,
            // pero nuestra API Route espera JSON en body para DELETE por consistencia (aunque no es standard REST estricto, Next lo permite)
        },
        body: JSON.stringify({ accessToken, calendarId }), 
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete calendar event: ${errorText}`);
    }

    return response.json();
}
