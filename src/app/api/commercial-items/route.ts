import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createCommercialItemServer, listCommercialItemsByDateServer } from '@/lib/server/commercial-items';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({ items: await listCommercialItemsByDateServer(searchParams.get('date')) });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los items comerciales.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createCommercialItemServer(body, requester) });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el item comercial.',
    });
  }
}
