import { NextResponse } from 'next/server';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  listConveniosCanjeServer,
  saveConvenioCanjeServer,
} from '@/lib/server/convenios';
import { convenioErrorResponse } from '@/app/api/convenios/utils';
import type { ConvenioCanje } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const convenios = await listConveniosCanjeServer();
    return NextResponse.json({ convenios });
  } catch (error) {
    return convenioErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los convenios.',
    });
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
    return convenioErrorResponse(error, {
      action: 'SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el convenio.',
    });
  }
}
