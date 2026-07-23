import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { updateCommercialItemServer } from '@/lib/server/commercial-items';

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { itemId } = await context.params;
    const body = await request.json();
    await updateCommercialItemServer(itemId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el item comercial.',
    });
  }
}
