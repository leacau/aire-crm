import { NextResponse } from 'next/server';
import { listClientsServer } from '@/lib/server/clients';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const context = await requireMobileSession(request);
  if (isMobileSessionResponse(context)) return context;

  try {
    return NextResponse.json({ clients: await listClientsServer(context.requester) });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'CLIENTS',
      requesterId: context.requester.uid,
      publicError: 'No se pudieron cargar los clientes mobile.',
    });
  }
}
