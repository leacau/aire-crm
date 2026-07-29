import { NextResponse } from 'next/server';
import { listOpportunitiesServer } from '@/lib/server/opportunities';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const context = await requireMobileSession(request);
  if (isMobileSessionResponse(context)) return context;

  try {
    return NextResponse.json({
      opportunities: await listOpportunitiesServer('active', null, context.requester),
    });
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'OPPORTUNITIES',
      requesterId: context.requester.uid,
      publicError: 'No se pudieron cargar las oportunidades mobile.',
    });
  }
}
