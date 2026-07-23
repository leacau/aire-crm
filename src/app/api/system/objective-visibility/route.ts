import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import {
  getObjectiveVisibilityConfigServer,
  saveObjectiveVisibilityConfigServer,
} from '@/lib/server/system-config';
import { systemErrorResponse } from '@/app/api/system/errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ config: await getObjectiveVisibilityConfigServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'OBJECTIVE VISIBILITY GET',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la configuracion de visibilidad de objetivos.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ config: await saveObjectiveVisibilityConfigServer(body?.config, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'OBJECTIVE VISIBILITY SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar la configuracion de visibilidad de objetivos.',
    });
  }
}
