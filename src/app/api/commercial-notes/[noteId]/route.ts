import { NextResponse } from 'next/server';
import { commercialNoteErrorResponse } from '@/app/api/commercial-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteCommercialNoteServer,
  getCommercialNoteServer,
  updateCommercialNoteServer,
} from '@/lib/server/commercial-notes';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    return NextResponse.json({ note: await getCommercialNoteServer(noteId, requester) });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la nota comercial.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    await updateCommercialNoteServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la nota comercial.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    await deleteCommercialNoteServer(noteId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la nota comercial.',
    });
  }
}
