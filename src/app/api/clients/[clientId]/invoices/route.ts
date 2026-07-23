import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listClientInvoicesServer } from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) return NextResponse.json({ invoices: [] });
    return NextResponse.json({ invoices: await listClientInvoicesServer(clientId, requester) });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'INVOICES LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las facturas del cliente.',
    });
  }
}
