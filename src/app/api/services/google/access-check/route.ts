import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { externalServiceErrorResponse } from '@/app/api/services/errors';

const SERVICE_CHECKS = [
  { name: 'calendar', url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1' },
  { name: 'drive', url: 'https://www.googleapis.com/drive/v3/about?fields=user' },
  { name: 'chat', url: 'https://chat.googleapis.com/v1/spaces?pageSize=1', optional: true },
] satisfies Array<{ name: string; url: string; optional?: boolean }>;

export async function POST(req: Request) {
  try {
    const serverUser = await requireServerUser(req);
    if (isServerResponse(serverUser)) return serverUser;

    const accessToken = req.headers.get('x-google-access-token');
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const failures: string[] = [];

    await Promise.all(
      SERVICE_CHECKS.map(async (service) => {
        try {
          const response = await fetch(service.url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!response.ok && !service.optional) {
            failures.push(service.name);
          }
        } catch {
          if (!service.optional) failures.push(service.name);
        }
      }),
    );

    if (failures.length) {
      return NextResponse.json({
        error: `Google services unavailable: ${failures.join(', ')}`,
        failures,
      }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return externalServiceErrorResponse(error, {
      service: 'GOOGLE',
      action: 'ACCESS CHECK',
      publicError: 'No se pudo validar el acceso a los servicios de Google.',
    });
  }
}
