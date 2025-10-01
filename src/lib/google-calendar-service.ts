

'use server';

export async function getCalendarEvents(accessToken: string, calendarId: string = 'primary') {
    const API_URL = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

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

export async function createCalendarEvent(accessToken: string, event: any, calendarId: string = 'primary') {
    const API_URL = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
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
        console.error('Google Calendar API Error on create:', error);
        throw new Error('Failed to create calendar event: ' + error.error?.message);
    }
    return await response.json();
}

export async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId: string = 'primary') {
    const API_URL = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
    const response = await fetch(API_URL, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    if (!response.ok && response.status !== 204) {
        const error = await response.json();
        console.error('Google Calendar API Error on delete:', error);
        throw new Error('Failed to delete calendar event: ' + error.error?.message);
    }
    return;
}
