import { NextResponse } from 'next/server';
import { webNoteErrorResponse } from '@/app/api/web-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { deleteWebNoteServer, getWebNoteServer, updateWebNoteServer } from '@/lib/server/web-notes';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    return NextResponse.json({ note: await getWebNoteServer(noteId, requester) });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la nota web.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    await updateWebNoteServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la nota web.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    await deleteWebNoteServer(noteId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la nota web.',
    });
  }
}
