import { NextResponse } from 'next/server';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { deleteClientServer, getClientServer, updateClientServer } from '@/lib/server/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    return NextResponse.json({ client: await getClientServer(clientId, requester) });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el cliente.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json();
    await updateClientServer(clientId, body?.data, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el cliente.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const { clientId } = await context.params;

  try {
    await deleteClientServer(clientId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el cliente.',
      status: 404,
    });
  }
}
