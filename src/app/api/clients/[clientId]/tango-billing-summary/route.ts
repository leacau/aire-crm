import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getClientTangoBillingSummaryServer } from '@/lib/server/tango';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({
        total: 0,
        invoiceCount: 0,
        truncated: false,
        byCompany: [],
        skippedCompanies: [],
      });
    }

    return NextResponse.json(await getClientTangoBillingSummaryServer(clientId, requester), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'TANGO BILLING SUMMARY',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el total facturado de Tango.',
    });
  }
}
