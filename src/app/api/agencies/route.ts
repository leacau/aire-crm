import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { AgencyApiError, createAgencyServer, listAgenciesServer } from '@/lib/server/agencies';
import type { Agency } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ agencies: await listAgenciesServer() });
  } catch (error: any) {
    console.error('AGENCIES LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las agencias.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;
  if (!(await hasServerScreenPermission(requester, 'Opportunities', 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const agencyData = body?.agencyData as Omit<Agency, 'id'> | undefined;

    return NextResponse.json({ id: await createAgencyServer(agencyData, requester) });
  } catch (error: any) {
    if (error instanceof AgencyApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('AGENCY CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear la agencia.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
