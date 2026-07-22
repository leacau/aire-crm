import { NextResponse } from 'next/server';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  ConvenioApiError,
  listConveniosCanjeServer,
  saveConvenioCanjeServer,
} from '@/lib/server/convenios';
import type { ConvenioCanje } from '@/lib/types';

function errorResponse(error: unknown) {
  if (error instanceof ConvenioApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const details = error instanceof Error ? error.message : 'Error desconocido';
  console.error('CONVENIOS API ERROR:', {
    message: details,
  });
  return NextResponse.json({
    error: 'No se pudo completar la operacion de convenios.',
    details,
  }, { status: 502 });
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const convenios = await listConveniosCanjeServer();
    return NextResponse.json({ convenios });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const id = await saveConvenioCanjeServer(
      body?.convenioData as Omit<ConvenioCanje, 'id' | 'createdAt'>,
      requester.uid,
      getRequesterName(requester),
    );
    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
