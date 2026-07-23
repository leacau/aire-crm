import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { pipelineInteractionErrorResponse } from '@/app/api/pipeline-interactions/errors';
import {
  deletePipelineInteractionServer,
  updatePipelineInteractionServer,
} from '@/lib/server/pipeline-interactions';
import type { PipelineInteraction } from '@/lib/types';

type RouteContext = {
  params: Promise<{ interactionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { interactionId } = await context.params;
    const body = await request.json();
    const data = body?.data as Partial<PipelineInteraction> | undefined;

    await updatePipelineInteractionServer(interactionId, data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return pipelineInteractionErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la interaccion del pipeline.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { interactionId } = await context.params;
    await deletePipelineInteractionServer(interactionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return pipelineInteractionErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la interaccion del pipeline.',
    });
  }
}
