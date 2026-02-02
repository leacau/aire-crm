'use client';

const SERVICE_CHECKS = [
  // ELIMINAMOS O COMENTAMOS LA LÍNEA DE GMAIL QUE CAUSA EL ERROR 403
  // { name: 'gmail', url: 'https://www.googleapis.com/gmail/v1/users/me/profile' },
  
  // Mantenemos Calendar y Drive que suelen tener permisos de lectura
  { name: 'calendar', url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1' },
  { name: 'drive', url: 'https://www.googleapis.com/drive/v3/about?fields=user' },
  
  // Chat también puede dar 403 si el usuario no aceptó scopes, lo marcamos como optional para que no bloquee toda la app
  { name: 'chat', url: 'https://chat.googleapis.com/v1/spaces?pageSize=1', optional: true },
] satisfies Array<{ name: string; url: string; optional?: boolean }>;

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

        if (!resp.ok && !service.optional) {
            // Si falla Calendar o Drive (críticos), lo marcamos
            console.warn(`Fallo en servicio ${service.name}: ${resp.status}`);
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
