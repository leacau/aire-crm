import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listClientOpportunitiesServer } from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) return NextResponse.json({ opportunities: [] });
    return NextResponse.json({ opportunities: await listClientOpportunitiesServer(clientId, requester) });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'OPPORTUNITIES LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las oportunidades del cliente.',
    });
  }
}
