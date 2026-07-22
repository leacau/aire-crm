import { NextResponse } from 'next/server';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import {
  ConvenioApiError,
  migrateLegacyConveniosToCanjesServer,
} from '@/lib/server/convenios';

function errorResponse(error: unknown) {
  if (error instanceof ConvenioApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const details = error instanceof Error ? error.message : 'Error desconocido';
  console.error('CONVENIOS MIGRATION API ERROR:', {
    message: details,
  });
  return NextResponse.json({
    error: 'No se pudo completar la migracion de convenios.',
    details,
  }, { status: 502 });
}

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const result = await migrateLegacyConveniosToCanjesServer(requester.uid, getRequesterName(requester));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
