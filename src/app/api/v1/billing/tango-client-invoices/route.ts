import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { listClientTangoInvoices } from '@/modules/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requireServerCapability(request, 'billing.read');
  if (isServerResponse(user)) return user;

  try {
    const { searchParams } = new URL(request.url);
    const invoices = await listClientTangoInvoices({
      aireClientId: searchParams.get('aireClientId') || undefined,
      srlClientId: searchParams.get('srlClientId') || undefined,
      sasClientId: searchParams.get('sasClientId') || undefined,
    });
    return NextResponse.json({ data: invoices }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
