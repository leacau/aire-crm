import { NextResponse } from 'next/server';

import { ApiError, apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { isTangoCompanyId, listTangoInvoices } from '@/modules/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requireServerCapability(request, 'billing.read');
  if (isServerResponse(user)) return user;

  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company') || '';
    if (!isTangoCompanyId(company)) {
      throw new ApiError(400, 'La compañía solicitada no es válida.', 'INVALID_TANGO_COMPANY');
    }

    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new ApiError(400, 'La fecha desde no puede ser posterior a la fecha hasta.', 'INVALID_DATE_RANGE');
    }

    const result = await listTangoInvoices({
      company,
      fromDate,
      toDate,
      client: searchParams.get('client') || undefined,
      seller: searchParams.get('seller') || undefined,
    });
    return NextResponse.json({ data: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
