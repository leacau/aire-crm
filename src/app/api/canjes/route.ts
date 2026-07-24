import { NextResponse } from 'next/server';
import { canjeErrorResponse } from '@/app/api/canjes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createCanjeServer, listCanjesServer } from '@/lib/server/canjes';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ canjes: await listCanjesServer(requester) });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los canjes.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createCanjeServer(body, requester) });
  } catch (error) {
    return canjeErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el canje.',
    });
  }
}
