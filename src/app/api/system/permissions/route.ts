import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { getAreaPermissionsServer, saveAreaPermissionsServer } from '@/lib/server/system-config';
import { systemErrorResponse } from '@/app/api/system/errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ permissions: await getAreaPermissionsServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'PERMISSIONS GET',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los permisos del sistema.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ permissions: await saveAreaPermissionsServer(body?.permissions) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'PERMISSIONS SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar los permisos del sistema.',
    });
  }
}
