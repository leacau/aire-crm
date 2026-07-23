import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { mergeClientsServer } from '@/lib/server/clients';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const targetClientId = String(body?.targetClientId || '');
    const sourceClientId = String(body?.sourceClientId || '');
    await mergeClientsServer(targetClientId, sourceClientId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'MERGE',
      requesterId: requester.uid,
      publicError: 'No se pudo fusionar el cliente.',
    });
  }
}
