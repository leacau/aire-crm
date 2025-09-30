
'use server';

export async function getCalendarEvents(accessToken: string) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + new Date().toISOString() + '&maxResults=10&singleEvents=true&orderBy=startTime', {
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
