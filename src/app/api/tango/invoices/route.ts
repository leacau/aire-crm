import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listTangoInvoicesServer } from '@/lib/server/tango';
import { tangoErrorResponse } from '@/app/api/tango/utils';

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  try {
    const { searchParams } = new URL(request.url);
    const result = await listTangoInvoicesServer({
      company: searchParams.get('company') || '',
      fromDate: searchParams.get('fromDate') || '',
      toDate: searchParams.get('toDate') || '',
      client: searchParams.get('client'),
      seller: searchParams.get('seller'),
      requester: serverUser,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return tangoErrorResponse(error, {
      action: 'INVOICES LIST',
      requesterId: serverUser.uid,
      publicError: 'No se pudieron consultar las facturas de Tango',
    });
  }
}
