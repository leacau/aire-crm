import { NextResponse } from 'next/server';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import {
  getClientServer,
  listClientActivitiesForClientServer,
  listClientOpportunitiesServer,
} from '@/lib/server/clients';
import { routeErrorResponse } from '@/lib/server/route-errors';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const sessionContext = await requireMobileSession(request);
  if (isMobileSessionResponse(sessionContext)) return sessionContext;

  try {
    const { clientId } = await context.params;

    if (!clientId) {
      return NextResponse.json({ error: 'Cliente invalido.' }, { status: 400 });
    }

    const [client, activities, opportunities] = await Promise.all([
      getClientServer(clientId, sessionContext.requester),
      listClientActivitiesForClientServer(clientId, sessionContext.requester),
      listClientOpportunitiesServer(clientId, sessionContext.requester),
    ]);

    return NextResponse.json({
      client,
      activities: activities.slice(0, 30),
      opportunities: opportunities.slice(0, 20),
    });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'CLIENT DETAIL',
      requesterId: sessionContext.requester.uid,
      publicError: 'No se pudo cargar el detalle del cliente mobile.',
    });
  }
}
