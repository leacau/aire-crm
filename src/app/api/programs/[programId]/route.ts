import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { programErrorResponse } from '@/app/api/programs/errors';
import {
  deleteProgramServer,
  getProgramServer,
  updateProgramServer,
} from '@/lib/server/programs';
import type { Program } from '@/lib/types';

type RouteContext = {
  params: Promise<{ programId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { programId } = await context.params;

    return NextResponse.json({
      program: await getProgramServer(programId),
    });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el programa.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { programId } = await context.params;
    const body = await request.json();
    const programData = (body?.programData || {}) as Partial<Omit<Program, 'id'>>;
    const updateKeys = Object.keys(programData);
    const touchesRates = updateKeys.includes('rates');
    const touchesProgramConfig = updateKeys.some(key => key !== 'rates');

    if (touchesRates && !(await hasServerScreenPermission(requester, 'Rates', 'edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (touchesProgramConfig && !(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await updateProgramServer(programId, programData, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el programa.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Grilla', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { programId } = await context.params;
    await deleteProgramServer(programId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el programa.',
    });
  }
}
