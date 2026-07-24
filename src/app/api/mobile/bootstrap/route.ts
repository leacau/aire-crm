import { NextResponse } from 'next/server';
import { isMobileSessionResponse, requireMobileSession } from '@/lib/server/mobile-auth';
import { buildMobileBootstrapServer } from '@/lib/server/mobile';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const context = await requireMobileSession(request);
  if (isMobileSessionResponse(context)) return context;

  try {
    return NextResponse.json(await buildMobileBootstrapServer(context.session, context.requester));
  } catch (error) {
    return routeErrorResponse(error, 'MOBILE', {
      action: 'BOOTSTRAP',
      requesterId: context.requester.uid,
      publicError: 'No se pudo cargar el inicio mobile.',
    });
  }
}
