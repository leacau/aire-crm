import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { bulkDeleteCommercialItemsServer } from '@/lib/server/commercial-items';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await bulkDeleteCommercialItemsServer(body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'BULK DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudieron eliminar los items comerciales.',
    });
  }
}
