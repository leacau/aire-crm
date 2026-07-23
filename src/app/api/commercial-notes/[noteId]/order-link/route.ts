import { NextResponse } from 'next/server';
import { commercialNoteErrorResponse } from '@/app/api/commercial-notes/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  linkCommercialNoteOrderServer,
  unlinkCommercialNoteOrderServer,
} from '@/lib/server/commercial-notes';

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json();
    await linkCommercialNoteOrderServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'ORDER LINK',
      requesterId: requester.uid,
      publicError: 'No se pudo vincular la nota comercial con la orden.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { noteId } = await context.params;
    const body = await request.json().catch(() => null);
    await unlinkCommercialNoteOrderServer(noteId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialNoteErrorResponse(error, {
      action: 'ORDER UNLINK',
      requesterId: requester.uid,
      publicError: 'No se pudo desvincular la nota comercial de la orden.',
    });
  }
}
