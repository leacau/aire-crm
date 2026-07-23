import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { systemErrorResponse } from '@/app/api/system/errors';
import { getSrlAdTypesServer, saveSrlAdTypesServer } from '@/lib/server/system-config';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ types: await getSrlAdTypesServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SRL AD TYPES GET',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los formatos comerciales de Radio/TV.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ types: await saveSrlAdTypesServer(body?.types, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SRL AD TYPES SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar los formatos comerciales de Radio/TV.',
    });
  }
}
