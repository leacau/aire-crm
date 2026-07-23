import { NextResponse } from 'next/server';
import { commercialNoteErrorResponse } from '@/app/api/commercial-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createCommercialNoteServer, listCommercialNotesServer } from '@/lib/server/commercial-notes';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({
      notes: await listCommercialNotesServer({
        clientId: searchParams.get('clientId'),
        advisorId: searchParams.get('advisorId'),
        orderId: searchParams.get('orderId'),
      }, requester),
    });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las notas comerciales.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createCommercialNoteServer(body, requester) });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la nota comercial.',
    });
  }
}
