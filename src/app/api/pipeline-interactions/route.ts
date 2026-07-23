import { NextResponse } from 'next/server';
import { requireServerManagement, isServerResponse } from '@/lib/server/auth';
import { pipelineInteractionErrorResponse } from '@/app/api/pipeline-interactions/errors';
import {
  createPipelineInteractionsServer,
  listPipelineInteractionsServer,
} from '@/lib/server/pipeline-interactions';
import type { PipelineInteraction } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ interactions: await listPipelineInteractionsServer() });
  } catch (error) {
    return pipelineInteractionErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las interacciones del pipeline.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const singleInteraction = body?.interaction as Partial<PipelineInteraction> | undefined;
    const bulkInteractions = Array.isArray(body?.interactions)
      ? body.interactions as Partial<PipelineInteraction>[]
      : null;
    const interactionsToCreate = bulkInteractions || (singleInteraction ? [singleInteraction] : []);

    const createdInteractions = await createPipelineInteractionsServer(
      interactionsToCreate,
      requester,
      { bulk: !!bulkInteractions },
    );

    if (!bulkInteractions) {
      return NextResponse.json({ id: createdInteractions[0]?.id });
    }

    return NextResponse.json({ interactions: createdInteractions });
  } catch (error) {
    return pipelineInteractionErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar las interacciones del pipeline.',
    });
  }
}
