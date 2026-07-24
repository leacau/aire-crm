import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ServerUser } from '@/lib/server/auth';
import type { PipelineInteraction } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

export class PipelineInteractionApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


export function mapPipelineInteraction(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): PipelineInteraction {
  return serializeDocument<PipelineInteraction>(id, data);
}

function cleanInteractionPayload(payload: Partial<PipelineInteraction>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'updatedAt'
      && key !== 'advisorId'
      && key !== 'advisorName'
      && value !== undefined
    )),
  ) as Record<string, unknown>;
}

function buildUpdatePayload(data: Partial<PipelineInteraction>) {
  const updateData = cleanInteractionPayload(data);
  updateData.updatedAt = FieldValue.serverTimestamp();
  return updateData;
}

function compareByFechaDesc(a: PipelineInteraction, b: PipelineInteraction) {
  return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime();
}

export async function listPipelineInteractionsServer(): Promise<PipelineInteraction[]> {
  const snapshot = await dbAdmin.collection('pipeline_interactions').orderBy('fecha', 'desc').get();
  return snapshot.docs.map(doc => mapPipelineInteraction(doc.id, doc.data()));
}

export async function createPipelineInteractionsServer(
  interactionsToCreate: Partial<PipelineInteraction>[],
  requester: ServerUser,
  options: { bulk: boolean },
): Promise<PipelineInteraction[]> {
  if (interactionsToCreate.length === 0) {
    throw new PipelineInteractionApiError('No hay interacciones para crear.', 400);
  }

  for (const interaction of interactionsToCreate) {
    if (!interaction.fecha || !interaction.empresa) {
      throw new PipelineInteractionApiError('Fecha y empresa son obligatorias.', 400);
    }
  }

  const requesterName = getRequesterName(requester);
  const createdInteractions: PipelineInteraction[] = [];

  for (let index = 0; index < interactionsToCreate.length; index += 450) {
    const batch = dbAdmin.batch();
    const chunk = interactionsToCreate.slice(index, index + 450);

    chunk.forEach(interaction => {
      const docRef = dbAdmin.collection('pipeline_interactions').doc();
      const dataToSave = {
        ...cleanInteractionPayload(interaction),
        advisorId: requester.uid,
        advisorName: requesterName,
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

  if (options.bulk) {
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'pipeline_interaction',
      entityId: 'bulk_import',
      entityName: `${createdInteractions.length} interacciones`,
      details: `importo <strong>${createdInteractions.length}</strong> interacciones al pipeline desde un archivo`,
      ownerName: requesterName,
    });
  }

  return createdInteractions.sort(compareByFechaDesc);
}

export async function updatePipelineInteractionServer(
  interactionId: string,
  data: Partial<PipelineInteraction> | undefined,
): Promise<void> {
  if (!data || Object.keys(data).length === 0) {
    throw new PipelineInteractionApiError('No hay cambios para aplicar.', 400);
  }

  const docRef = dbAdmin.collection('pipeline_interactions').doc(interactionId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new PipelineInteractionApiError('Interaccion no encontrada.', 404);
  }

  await docRef.update(buildUpdatePayload(data));
}

export async function deletePipelineInteractionServer(interactionId: string): Promise<void> {
  const docRef = dbAdmin.collection('pipeline_interactions').doc(interactionId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new PipelineInteractionApiError('Interaccion no encontrada.', 404);
  }

  await docRef.delete();
}