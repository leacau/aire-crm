import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { getRequesterName } from '@/app/api/clients/utils';
import { programErrorResponse } from '@/app/api/programs/errors';
import { mapProgram, stripLegacyScheduleFields } from '@/app/api/programs/utils';
import type { Program } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const snapshot = await dbAdmin.collection('programs').orderBy('name').get();
    const programs = snapshot.docs.map(doc => mapProgram(doc.id, doc.data()));

    return NextResponse.json({ programs });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los programas.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const programData = body?.programData as Omit<Program, 'id'> | undefined;
    const name = programData?.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'El nombre del programa es obligatorio.' }, { status: 400 });
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

    return NextResponse.json({ id: docRef.id });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el programa.',
    });
  }
}
