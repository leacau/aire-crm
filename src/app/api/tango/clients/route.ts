import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { listTangoClientsServer } from '@/lib/server/tango';
import { tangoErrorResponse } from '@/app/api/tango/errors';

export async function GET(request: Request) {
  const serverUser = await requireServerManagement(request);
  if (isServerResponse(serverUser)) return serverUser;

  try {
    const { searchParams } = new URL(request.url);
    const data = await listTangoClientsServer(searchParams.get('company') || '');
    return NextResponse.json(data);
  } catch (error) {
    return tangoErrorResponse(error, {
      action: 'CLIENTS LIST',
      requesterId: serverUser.uid,
      publicError: 'Fallo de conexion con Tango',
    });
  }
}
