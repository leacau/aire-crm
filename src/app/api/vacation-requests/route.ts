import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  createVacationRequestServer,
  listVacationRequests,
  VacationRequestApiError,
} from '@/lib/server/vacation-requests';
import type { VacationRequest } from '@/lib/types';

function errorResponse(error: unknown) {
  if (error instanceof VacationRequestApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Vacation requests API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const requests = await listVacationRequests(requester);
    return NextResponse.json({ requests });
  } catch (error) {
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
