import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { getRequesterName } from '@/app/api/clients/utils';
import { mapProgram, stripLegacyScheduleFields } from '@/app/api/programs/utils';
import type { Program } from '@/lib/types';

type RouteContext = {
  params: Promise<{ programId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { programId } = await context.params;
  const snap = await dbAdmin.collection('programs').doc(programId).get();

  return NextResponse.json({
    program: snap.exists ? mapProgram(snap.id, snap.data()) : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { programId } = await context.params;
  const body = await request.json();
  const programData = (body?.programData || {}) as Partial<Omit<Program, 'id'>>;
  const docRef = dbAdmin.collection('programs').doc(programId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }

  const originalProgram = mapProgram(originalSnap.id, originalSnap.data());
  const dataToUpdate = stripLegacyScheduleFields({
    ...programData,
    updatedBy: requester.uid,
    updatedAt: FieldValue.serverTimestamp() as any,
  } as Partial<Program>);

  await docRef.update(dataToUpdate);

  const requesterName = getRequesterName(requester);
  const programName = programData.name || originalProgram.name;
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'program' as any,
    entityId: programId,
    entityName: programName,
    details: `actualizo el programa <strong>${programName}</strong>`,
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { programId } = await context.params;
  const docRef = dbAdmin.collection('programs').doc(programId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }

  const originalProgram = mapProgram(originalSnap.id, originalSnap.data());
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'program' as any,
    entityId: programId,
    entityName: originalProgram.name,
    details: `elimino el programa <strong>${originalProgram.name}</strong>`,
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}
