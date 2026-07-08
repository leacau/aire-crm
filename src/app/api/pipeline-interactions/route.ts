import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { requireServerManagement, isServerResponse } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { PipelineInteraction } from '@/lib/types';

function mapPipelineInteraction(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): PipelineInteraction {
  return serializeDocument<PipelineInteraction>(id, data);
}

function cleanInteractionPayload(payload: Partial<PipelineInteraction>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'updatedAt'
      && key !== 'advisorId'
      && key !== 'advisorName'
      && value !== undefined
    )),
  ) as Record<string, unknown>;

  return cleaned;
}

function compareByFechaDesc(a: PipelineInteraction, b: PipelineInteraction) {
  return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime();
}

export async function GET(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const snapshot = await dbAdmin.collection('pipeline_interactions').orderBy('fecha', 'desc').get();
  const interactions = snapshot.docs.map(doc => mapPipelineInteraction(doc.id, doc.data()));

  return NextResponse.json({ interactions });
}

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const singleInteraction = body?.interaction as Partial<PipelineInteraction> | undefined;
  const bulkInteractions = Array.isArray(body?.interactions)
    ? body.interactions as Partial<PipelineInteraction>[]
    : null;
  const interactionsToCreate = bulkInteractions || (singleInteraction ? [singleInteraction] : []);

  if (interactionsToCreate.length === 0) {
    return NextResponse.json({ error: 'No hay interacciones para crear.' }, { status: 400 });
  }

  for (const interaction of interactionsToCreate) {
    if (!interaction.fecha || !interaction.empresa) {
      return NextResponse.json({ error: 'Fecha y empresa son obligatorias.' }, { status: 400 });
    }
  }

  const createdInteractions: PipelineInteraction[] = [];

  for (let index = 0; index < interactionsToCreate.length; index += 450) {
    const batch = dbAdmin.batch();
    const chunk = interactionsToCreate.slice(index, index + 450);

    chunk.forEach(interaction => {
      const docRef = dbAdmin.collection('pipeline_interactions').doc();
      const dataToSave = {
        ...cleanInteractionPayload(interaction),
        advisorId: requester.uid,
        advisorName: requester.name || requester.email || 'Usuario',
        createdAt: FieldValue.serverTimestamp(),
      };
      batch.set(docRef, dataToSave);
      createdInteractions.push({
        id: docRef.id,
        ...(dataToSave as unknown as Omit<PipelineInteraction, 'id' | 'createdAt'>),
        createdAt: new Date().toISOString(),
      });
    });

    await batch.commit();
  }

  if (bulkInteractions) {
    await logServerActivity({
      userId: requester.uid,
      userName: requester.name || requester.email || 'Usuario',
      type: 'create',
      entityType: 'pipeline_interaction',
      entityId: 'bulk_import',
      entityName: `${createdInteractions.length} interacciones`,
      details: `importo <strong>${createdInteractions.length}</strong> interacciones al pipeline desde un archivo`,
      ownerName: requester.name || requester.email || 'Usuario',
    });
  }

  createdInteractions.sort(compareByFechaDesc);

  if (!bulkInteractions) {
    return NextResponse.json({ id: createdInteractions[0]?.id });
  }

  return NextResponse.json({ interactions: createdInteractions });
}
