import { NextResponse } from 'next/server';
import { socialMediaRequestErrorResponse } from '@/app/api/social-media-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  deleteSocialMediaRequestServer,
  getSocialMediaRequestServer,
  updateSocialMediaRequestServer,
} from '@/lib/server/social-media-requests';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    return NextResponse.json({ request: await getSocialMediaRequestServer(requestId, requester) });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el pedido de redes.',
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    await updateSocialMediaRequestServer(requestId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el pedido de redes.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    await deleteSocialMediaRequestServer(requestId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar el pedido de redes.',
    });
  }
}
