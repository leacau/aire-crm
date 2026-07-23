import { NextResponse } from 'next/server';
import { socialMediaRequestErrorResponse } from '@/app/api/social-media-requests/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  createSocialMediaRequestServer,
  listSocialMediaRequestsServer,
} from '@/lib/server/social-media-requests';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({
      requests: await listSocialMediaRequestsServer({
        clientId: searchParams.get('clientId'),
        orderId: searchParams.get('orderId'),
      }, requester),
    });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pedidos de redes.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createSocialMediaRequestServer(body, requester) });
  } catch (error) {
    return socialMediaRequestErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el pedido de redes.',
    });
  }
}
