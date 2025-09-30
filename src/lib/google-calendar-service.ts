
'use server';

const API_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function getCalendarEvents(accessToken: string) {
    const response = await fetch(`${API_URL}?timeMin=${new Date().toISOString()}&maxResults=250&singleEvents=true&orderBy=startTime`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Calendar API Error:', error);
        throw new Error('Failed to fetch calendar events: ' + error.error?.message);
    }

    const data = await response.json();
    return data.items;
}

export async function createCalendarEvent(accessToken: string, event: object) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Calendar API Error:', error);
        throw new Error('Failed to create calendar event: ' + error.error?.message);
    }

    return await response.json();
}

export async function deleteCalendarEvent(accessToken: string, eventId: string) {
    const response = await fetch(`${API_URL}/${eventId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        }
    });

    if (!response.ok && response.status !== 204) { // 204 No Content is a success response for DELETE
        const error = await response.json();
        console.error('Google Calendar API Error:', error);
        throw new Error('Failed to delete calendar event: ' + error.error?.message);
    }

    return; // No content to return on success
}
