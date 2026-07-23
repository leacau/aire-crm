import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { clientErrorResponse } from '@/app/api/clients/errors';
import type { Client } from '@/lib/types';
import { bulkDeleteClientsServer, bulkUpdateClientsServer } from '@/lib/server/clients';

export async function DELETE(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const clientIds = Array.isArray(body?.clientIds) ? body.clientIds.map(String).filter(Boolean) : [];
    await bulkDeleteClientsServer(clientIds, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BULK DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudieron eliminar los clientes.',
    });
  }
}

export async function PATCH(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const updates = Array.isArray(body?.updates)
      ? body.updates as { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[]
      : [];
    await bulkUpdateClientsServer(updates, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'BULK UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudieron actualizar los clientes.',
    });
  }
}
