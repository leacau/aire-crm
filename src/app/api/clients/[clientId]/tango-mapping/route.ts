import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { clientErrorResponse } from '@/app/api/clients/errors';
import {
  deleteClientTangoMappingServer,
  updateClientTangoMappingServer,
} from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json();
    await updateClientTangoMappingServer(clientId, body?.data, body?.markSyncedField, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'TANGO MAPPING UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el mapeo Tango del cliente.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => null);
    await deleteClientTangoMappingServer(clientId, body?.crmIdField, body?.syncedField, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'TANGO MAPPING DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo quitar el mapeo Tango del cliente.',
    });
  }
}
