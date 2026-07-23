import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listCommercialItemsBySeriesServer } from '@/lib/server/commercial-items';

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { seriesId } = await context.params;
    return NextResponse.json({ items: await listCommercialItemsBySeriesServer(seriesId) });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'SERIES DETAIL',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la serie comercial.',
    });
  }
}
