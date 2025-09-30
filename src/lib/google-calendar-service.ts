

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
