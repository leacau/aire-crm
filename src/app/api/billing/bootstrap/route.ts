import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getBillingBootstrapServer } from '@/lib/server/billing';
import { routeErrorResponse } from '@/lib/server/route-errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json(await getBillingBootstrapServer(requester), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return routeErrorResponse(error, 'BILLING', {
      action: 'BOOTSTRAP',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los datos de facturacion.',
    });
  }
}
