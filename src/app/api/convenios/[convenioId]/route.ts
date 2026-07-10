import { NextResponse } from 'next/server';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  ConvenioApiError,
  deleteConvenioCanjeServer,
  updateConvenioCanjeServer,
} from '@/lib/server/convenios';
import type { ConvenioCanje } from '@/lib/types';

type RouteContext = {
  params: Promise<{ convenioId: string }>;
};

function errorResponse(error: unknown) {
  if (error instanceof ConvenioApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Convenio API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

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
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
