import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listClientAdvertisingOrdersServer } from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) return NextResponse.json({ orders: [] });
    return NextResponse.json({ orders: await listClientAdvertisingOrdersServer(clientId, requester) });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'ADVERTISING ORDERS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las ordenes de publicidad del cliente.',
    });
  }
}
