'use server';

const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';


// --- Gmail Service ---

interface EmailParams {
    accessToken?: string | null;
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ accessToken, to, subject, body }: EmailParams) {
    if (!accessToken) {
        console.warn("Skipping email send because accessToken is missing.");
        return;
    }

    const emailParts = [
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `Subject: ${subject}`,
        ``,
        body,
    ];
    const email = emailParts.join('\r\n');

    try {
        const response = await fetch(GMAIL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw: Buffer.from(email).toString('base64url'),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Google Gmail API Error:', error);
        }
    } catch (error) {
        console.error("Network or other error during email send:", error);
    }
}


// --- Calendar Service ---

export async function createCalendarEvent(accessToken: string, event: object) {
    const response = await fetch(CALENDAR_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Calendar API Error (Create):', error);
        throw new Error('Failed to create calendar event: ' + (error.error?.message || 'Unknown error'));
    }

    return await response.json();
}

// CORRECCIÓN: Cambiamos a PATCH para actualización parcial segura
export async function updateCalendarEvent(accessToken: string, eventId: string, event: object) {
    const response = await fetch(`${CALENDAR_API_URL}/${eventId}`, {
        method: 'PATCH', 
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Calendar API Error (Update):', error);
        throw new Error('Failed to update calendar event: ' + (error.error?.message || 'Unknown error'));
    }

    return await response.json();
}


export async function deleteCalendarEvent(accessToken: string, eventId: string) {
    const response = await fetch(`${CALENDAR_API_URL}/${eventId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        }
    });

    if (!response.ok && response.status !== 204 && response.status !== 404 && response.status !== 410) { 
        // Aceptamos 404 y 410 como "ya eliminado" para evitar errores en la UI
        const error = await response.json();
        console.error('Google Calendar API Error (Delete):', error);
        throw new Error('Failed to delete calendar event: ' + (error.error?.message || 'Unknown error'));
    }

    return; 
}
