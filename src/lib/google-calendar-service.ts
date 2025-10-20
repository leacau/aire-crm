

'use server';

const API_URL_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

export async function getCalendarEvents(accessToken: string, calendarId: string = 'primary') {
    const calendarUrl = `${API_URL_BASE}/${encodeURIComponent(calendarId)}/events`;
    const response = await fetch(`${calendarUrl}?timeMin=${new Date().toISOString()}&maxResults=250&singleEvents=true&orderBy=startTime`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Google Calendar API Error:', error);
        throw new Error('Failed to fetch calendar events: ' + (error.error?.message || `Status ${response.status}`));
    }

    const data = await response.json();
    return data.items;
}
