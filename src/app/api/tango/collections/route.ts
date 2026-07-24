import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listTangoCollectionsServer } from '@/lib/server/tango';
import { tangoErrorResponse } from '@/app/api/tango/errors';

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  try {
    const { searchParams } = new URL(request.url);
    const result = await listTangoCollectionsServer({
      status: searchParams.get('status') || 'paid',
      fromDate: searchParams.get('fromDate') || '',
      toDate: searchParams.get('toDate') || '',
      requester: serverUser,
    });

    return NextResponse.json(result);
  } catch (error) {
    return tangoErrorResponse(error, {
      action: 'COLLECTIONS LIST',
      requesterId: serverUser.uid,
      publicError: 'No se pudieron consultar las cobranzas de Tango',
    });
  }
}
