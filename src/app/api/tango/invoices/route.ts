import { NextResponse } from 'next/server';

import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { isTangoCompanyId, listTangoInvoices } from '@/modules/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  const { searchParams } = new URL(request.url);
  const company = searchParams.get('company') || '';
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;

  if (!isTangoCompanyId(company)) {
    return NextResponse.json({ error: 'Company no permitida' }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: 'El rango de fechas no es válido' }, { status: 400 });
  }

  try {
    const result = await listTangoInvoices({
      company,
      fromDate,
      toDate,
      client: searchParams.get('client') || undefined,
      seller: searchParams.get('seller') || undefined,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error consulting Tango invoices:', error);
    const status = error instanceof Error && error.message.includes('TANGO_API_AUTHORIZATION') ? 500 : 502;
    return NextResponse.json({
      error: 'No se pudieron consultar las facturas de Tango',
      details: error instanceof Error ? error.message : 'Error desconocido',
    }, { status });
  }
}
