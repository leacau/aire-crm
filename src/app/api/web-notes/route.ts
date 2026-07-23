import { NextResponse } from 'next/server';
import { webNoteErrorResponse } from '@/app/api/web-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createWebNoteServer, listWebNotesServer } from '@/lib/server/web-notes';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({
      notes: await listWebNotesServer({
        clientId: searchParams.get('clientId'),
        orderId: searchParams.get('orderId'),
      }, requester),
    });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las notas web.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createWebNoteServer(body, requester) });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la nota web.',
    });
  }
}
