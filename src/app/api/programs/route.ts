import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { programErrorResponse } from '@/app/api/programs/errors';
import { createProgramServer, listProgramsServer } from '@/lib/server/programs';
import type { Program } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ programs: await listProgramsServer() });
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
    return NextResponse.json({ id: await createProgramServer(programData, requester) });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el programa.',
    });
  }
}
