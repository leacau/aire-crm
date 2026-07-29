import { NextResponse } from 'next/server';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { listOpportunitiesServer } from '@/lib/server/opportunities';
import { routeErrorResponse } from '@/lib/server/route-errors';

type RouteContext = {
  params: Promise<{ opportunityId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const sessionContext = await requireMobileSession(request);
  if (isMobileSessionResponse(sessionContext)) return sessionContext;

  try {
    const { opportunityId } = await context.params;

    if (!opportunityId) {
      return NextResponse.json({ error: 'Oportunidad invalida.' }, { status: 400 });
    }

    const opportunities = await listOpportunitiesServer('all', null, sessionContext.requester);
    const opportunity = opportunities.find(item => item.id === opportunityId) || null;

    if (!opportunity) {
      return NextResponse.json({ error: 'Oportunidad no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ opportunity });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'OPPORTUNITY DETAIL',
      requesterId: sessionContext.requester.uid,
      publicError: 'No se pudo cargar el detalle de la oportunidad mobile.',
    });
  }
}
