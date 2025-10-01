
'use server';

const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';

// --- Gmail Service ---

interface EmailParams {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ accessToken, to, subject, body }: EmailParams) {
    // RFC 2822 formatted email
    const emailParts = [
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `Subject: ${subject}`,
        ``,
        body,
    ];
    const email = emailParts.join('\r\n');

    const response = await fetch(GMAIL_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            // The raw email message has to be base64url encoded
            raw: Buffer.from(email).toString('base64url'),
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Gmail API Error:', error);
        throw new Error('Failed to send email: ' + (error.error?.message || 'Unknown error'));
    }

    return await response.json();
}


// --- Calendar Service ---

async function callCalendarApi(accessToken: string, calendarId: string, event: object, method: 'POST' | 'PUT' | 'DELETE', eventId?: string) {
    const CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';
    const url = eventId ? `${CALENDAR_API_BASE_URL}/${calendarId}/events/${eventId}` : `${CALENDAR_API_BASE_URL}/${calendarId}/events`;

    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        ...(method !== 'DELETE' && { body: JSON.stringify(event) })
    });

    if (!response.ok && response.status !== 204) {
        const error = await response.json();
        console.error(`Google Calendar API Error (${method}):`, error);
        throw new Error(`Failed to ${method} calendar event: ` + error.error?.message);
    }
    
    // For DELETE requests with 204 No Content, response.json() will fail
    return response.status === 204 ? null : await response.json();
}

export async function createCalendarEvent(accessToken: string, event: object) {
    // Always add to primary calendar
    const primaryResult = await callCalendarApi(accessToken, 'primary', event, 'POST');

    // If a shared calendar is configured, add it there as well
    const sharedCalendarId = process.env.NEXT_PUBLIC_SHARED_CALENDAR_ID;
    if (sharedCalendarId) {
        try {
            await callCalendarApi(accessToken, sharedCalendarId, event, 'POST');
        } catch (e) {
            console.warn("Failed to add event to shared calendar, but it was added to primary.", e);
        }
    }
    
    return primaryResult;
}

export async function updateCalendarEvent(accessToken: string, eventId: string, event: object, calendarId: string = 'primary') {
    // This is simplified. A real app might need to find the corresponding event in the shared calendar
    // if only the primary eventId is known. For now, we update them separately if the calendarId is provided.
    return await callCalendarApi(accessToken, calendarId, event, 'PUT', eventId);
}


export async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId: string = 'primary') {
    // This is also simplified. A robust solution would need to find and delete the event from both
    // primary and shared calendars, which requires storing both event IDs.
     return await callCalendarApi(accessToken, calendarId, {}, 'DELETE', eventId);
}
