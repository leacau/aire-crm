import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  createVacationRequestServer,
  listVacationRequests,
} from '@/lib/server/vacation-requests';
import { vacationRequestErrorResponse } from '@/app/api/vacation-requests/errors';
import type { VacationRequest } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const requests = await listVacationRequests(requester);
    return NextResponse.json({ requests });
  } catch (error) {
    return vacationRequestErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las solicitudes de licencia.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const result = await createVacationRequestServer(
      body?.requestData as Omit<VacationRequest, 'id' | 'status'>,
      body?.managerEmail || null,
      requester,
    );
    return NextResponse.json(result);
  } catch (error) {
    return vacationRequestErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la solicitud de licencia.',
    });
  }
}
