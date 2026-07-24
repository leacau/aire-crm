import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getRequesterName } from '@/lib/server/requester';
import {
  deleteConvenioCanjeServer,
  updateConvenioCanjeServer,
} from '@/lib/server/convenios';
import { convenioErrorResponse } from '@/app/api/convenios/errors';
import type { ConvenioCanje } from '@/lib/types';

type RouteContext = {
  params: Promise<{ convenioId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { convenioId } = await context.params;
    const body = await request.json();
    await updateConvenioCanjeServer(
      convenioId,
      body?.data as Partial<Omit<ConvenioCanje, 'id' | 'createdAt'>>,
      requester.uid,
      getRequesterName(requester),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return convenioErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el convenio.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { convenioId } = await context.params;
    const body = await request.json().catch(() => ({}));
    await deleteConvenioCanjeServer(
      convenioId,
      body?.opportunityId ? String(body.opportunityId) : undefined,
      requester.uid,
      getRequesterName(requester),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return convenioErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el convenio.',
    });
  }
}
