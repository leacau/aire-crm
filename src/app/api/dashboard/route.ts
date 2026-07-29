import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getDashboardBootstrapServer } from '@/lib/server/dashboard';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const includeHeavy = searchParams.get('includeHeavy') === 'true';
    return NextResponse.json(await getDashboardBootstrapServer(requester, includeHeavy), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return routeErrorResponse(error, 'DASHBOARD', {
      action: 'BOOTSTRAP',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el dashboard.',
    });
  }
}
