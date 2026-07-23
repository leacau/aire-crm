import { NextResponse } from 'next/server';
import { opportunityErrorResponse } from '@/app/api/opportunities/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteOpportunityServer,
  getOpportunityServer,
  updateOpportunityServer,
} from '@/lib/server/opportunities';

type RouteContext = {
  params: Promise<{ opportunityId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { opportunityId } = await context.params;
    return NextResponse.json({ opportunity: await getOpportunityServer(opportunityId) });
  } catch (error) {
    return opportunityErrorResponse(error, {
      action: 'GET',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la oportunidad.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { opportunityId } = await context.params;
    const body = await request.json();
    return NextResponse.json({
      ok: true,
      ...(await updateOpportunityServer(opportunityId, body, requester)),
    });
  } catch (error) {
    return opportunityErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la oportunidad.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { opportunityId } = await context.params;
    await deleteOpportunityServer(opportunityId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return opportunityErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la oportunidad.',
    });
  }
}
