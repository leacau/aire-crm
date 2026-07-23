import { NextResponse } from 'next/server';
import { socialMediaRequestErrorResponse } from '@/app/api/social-media-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  linkSocialMediaRequestOrderServer,
  unlinkSocialMediaRequestOrderServer,
} from '@/lib/server/social-media-requests';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    await linkSocialMediaRequestOrderServer(requestId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'ORDER LINK',
      requesterId: requester.uid,
      publicError: 'No se pudo vincular el pedido de redes con la orden.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json().catch(() => null);
    await unlinkSocialMediaRequestOrderServer(requestId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'ORDER UNLINK',
      requesterId: requester.uid,
      publicError: 'No se pudo desvincular el pedido de redes de la orden.',
    });
  }
}
