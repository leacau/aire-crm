import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import type { PipelineInteraction } from '@/lib/types';

type RouteContext = {
  params: Promise<{ interactionId: string }>;
};

function buildUpdatePayload(data: Partial<PipelineInteraction>) {
  const updateData = Object.fromEntries(
    Object.entries(data).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'advisorId'
      && key !== 'advisorName'
      && value !== undefined
    )),
  ) as Record<string, unknown>;

  updateData.updatedAt = FieldValue.serverTimestamp();
  return updateData;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const { interactionId } = await context.params;
  const body = await request.json();
  const data = body?.data as Partial<PipelineInteraction> | undefined;

  if (!data || Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 });
  }

  const docRef = dbAdmin.collection('pipeline_interactions').doc(interactionId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return NextResponse.json({ error: 'Interaccion no encontrada.' }, { status: 404 });
  }

  await docRef.update(buildUpdatePayload(data));

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const { interactionId } = await context.params;
  const docRef = dbAdmin.collection('pipeline_interactions').doc(interactionId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return NextResponse.json({ error: 'Interaccion no encontrada.' }, { status: 404 });
  }

  await docRef.delete();

  return NextResponse.json({ ok: true });
}
