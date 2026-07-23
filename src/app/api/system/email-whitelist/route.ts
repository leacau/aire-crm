import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { getEmailWhitelistServer, saveEmailWhitelistServer } from '@/lib/server/system-config';
import { systemErrorResponse } from '@/app/api/system/errors';

export async function GET(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ emails: await getEmailWhitelistServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'EMAIL WHITELIST LIST',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la lista blanca de accesos.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ emails: await saveEmailWhitelistServer(body?.emails, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'EMAIL WHITELIST SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar la lista blanca de accesos.',
    });
  }
}
