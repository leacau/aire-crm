import { NextResponse } from 'next/server';
import { webNoteErrorResponse } from '@/app/api/web-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { linkWebNoteOrderServer, unlinkWebNoteOrderServer } from '@/lib/server/web-notes';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    await linkWebNoteOrderServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'ORDER LINK',
      requesterId: requester.uid,
      publicError: 'No se pudo vincular la nota web con la orden.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json().catch(() => null);
    await unlinkWebNoteOrderServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return webNoteErrorResponse(error, {
      action: 'ORDER UNLINK',
      requesterId: requester.uid,
      publicError: 'No se pudo desvincular la nota web de la orden.',
    });
  }
}
