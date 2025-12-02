'use client';

const SERVICE_CHECKS = [
  { name: 'gmail', url: 'https://www.googleapis.com/gmail/v1/users/me/profile' },
  { name: 'calendar', url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1' },
  { name: 'drive', url: 'https://www.googleapis.com/drive/v3/about?fields=user' },
];

export async function validateGoogleServicesAccess(accessToken: string) {
  const failures: string[] = [];

  await Promise.all(
    SERVICE_CHECKS.map(async (service) => {
      try {
        const resp = await fetch(service.url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!resp.ok) {
          failures.push(service.name);
        }
      } catch (error) {
        console.error(`Error checking ${service.name} access`, error);
        failures.push(service.name);
      }
    })
  );

  if (failures.length) {
    throw new Error(`Google services unavailable: ${failures.join(', ')}`);
  }
}
