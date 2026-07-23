import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { ServerUser } from '@/lib/server/auth';
import type { Program } from '@/lib/types';

export class ProgramApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function getRequesterName(requester: ServerUser) {
  return requester.name || requester.email || 'Usuario';
}

export function mapProgram(id: string, data: FirebaseFirestore.DocumentData | undefined): Program {
  const program = serializeDocument<Program>(id, data);

  if (!program.schedules) {
    return {
      ...program,
      schedules: [{
        id: 'default',
        daysOfWeek: program.daysOfWeek || [],
        startTime: program.startTime || '',
        endTime: program.endTime || '',
      }],
    };
  }

  return program;
}

export function stripLegacyScheduleFields<T extends Partial<Program>>(programData: T): Partial<Program> {
  const dataToSave = { ...programData };
  delete dataToSave.startTime;
  delete dataToSave.endTime;
  delete dataToSave.daysOfWeek;
  return dataToSave;
}

export async function listProgramsServer(): Promise<Program[]> {
  const snapshot = await dbAdmin.collection('programs').orderBy('name').get();
  return snapshot.docs.map(doc => mapProgram(doc.id, doc.data()));
}

export async function listPublicProgramsServer(): Promise<Array<Pick<Program, 'id' | 'name'>>> {
  const snapshot = await dbAdmin.collection('programs').orderBy('name').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Programa',
    };
  });
}

export async function getProgramServer(programId: string): Promise<Program | null> {
  const snap = await dbAdmin.collection('programs').doc(programId).get();
  return snap.exists ? mapProgram(snap.id, snap.data()) : null;
}

export async function createProgramServer(
  programData: Omit<Program, 'id'> | undefined,
  requester: ServerUser,
): Promise<string> {
  const name = programData?.name?.trim();

  if (!name) {
    throw new ProgramApiError('El nombre del programa es obligatorio.', 400);
  }

  const requesterName = getRequesterName(requester);
  const dataToSave = stripLegacyScheduleFields({
    ...programData,
    name,
    createdBy: requester.uid,
    createdAt: FieldValue.serverTimestamp() as any,
  } as Partial<Program>);

  const docRef = await dbAdmin.collection('programs').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'program' as any,
    entityId: docRef.id,
    entityName: name,
    details: `creo el programa <strong>${name}</strong>`,
    ownerName: requesterName,
  });

  return docRef.id;
}

export async function updateProgramServer(
  programId: string,
  programData: Partial<Omit<Program, 'id'>>,
  requester: ServerUser,
): Promise<void> {
  const docRef = dbAdmin.collection('programs').doc(programId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    throw new ProgramApiError('Program not found', 404);
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
}

export async function deleteProgramServer(programId: string, requester: ServerUser): Promise<void> {
  const docRef = dbAdmin.collection('programs').doc(programId);
  const originalSnap = await docRef.get();

  if (!originalSnap.exists) {
    throw new ProgramApiError('Program not found', 404);
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
}
