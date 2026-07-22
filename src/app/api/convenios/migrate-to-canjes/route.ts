import { NextResponse } from 'next/server';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import {
  migrateLegacyConveniosToCanjesServer,
} from '@/lib/server/convenios';
import { convenioErrorResponse } from '@/app/api/convenios/utils';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const result = await migrateLegacyConveniosToCanjesServer(requester.uid, getRequesterName(requester));
    return NextResponse.json(result);
  } catch (error) {
    return convenioErrorResponse(error, {
      action: 'MIGRATE TO CANJES',
      requesterId: requester.uid,
      publicError: 'No se pudo completar la migracion de convenios.',
    });
  }
}
