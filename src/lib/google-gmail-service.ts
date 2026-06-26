import { auth } from './firebase';

export interface EmailAttachment {
    filename: string;
    content: string;
    encoding?: 'base64' | string;
}

export interface EmailParams {
    accessToken?: string | null;
    to: string | string[];
    subject: string;
    body: string;
    attachments?: EmailAttachment[];
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
}

async function getCrmIdToken(): Promise<string> {
    // 🟢 Pasamos "true" para forzar la actualización del token 
    // y evitar el 401 si el token expiró en plena carga del PDF.
    const idToken = await auth.currentUser?.getIdToken(true);
    if (!idToken) {
        throw new Error('Missing CRM authentication token.');
    }
    return idToken;
}

export async function sendEmail(params: EmailParams) {
    if (!params.accessToken) {
        console.warn('Skipping email send because accessToken is missing.');
        return;
    }

    const idToken = await getCrmIdToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let response: Response;
    try {
        response = await fetch('/api/services/gmail/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify(params),
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('El servicio de correo no respondió a tiempo.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send email: ${errorText}`);
    }

    return response.json();
}

export async function createCalendarEvent(accessToken: string, event: object, calendarId: string = 'primary') {
    const idToken = await getCrmIdToken();
    const response = await fetch('/api/services/calendar/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
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
    const idToken = await getCrmIdToken();
    const response = await fetch(`/api/services/calendar/events/${eventId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
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
    const idToken = await getCrmIdToken();
    const response = await fetch(`/api/services/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ accessToken, calendarId }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete calendar event: ${errorText}`);
    }

    return response.json();
}
