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
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
        throw new Error('Missing CRM authentication token.');
    }
    return idToken;
}

export async function sendEmail(params: EmailParams) {
    const idToken = await getCrmIdToken();
    const response = await fetch('/api/services/gmail/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        const errorText = await response.text();
        try {
            const payload = JSON.parse(errorText);
            const error = new Error(payload.error || 'No se pudo enviar el correo.') as Error & { code?: string };
            error.code = payload.code;
            throw error;
        } catch (parseError) {
            if (parseError instanceof Error && (parseError as Error & { code?: string }).code) {
                throw parseError;
            }
            throw new Error(`No se pudo enviar el correo: ${errorText}`);
        }
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
