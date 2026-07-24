import { NextResponse } from 'next/server';
import { canjeErrorResponse } from '@/app/api/canjes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listCanjeInvoicesServer } from '@/lib/server/canjes';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    return NextResponse.json({ invoices: await listCanjeInvoicesServer(canjeId, requester) });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'INVOICES',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las facturas del canje.',
    });
  }
}
