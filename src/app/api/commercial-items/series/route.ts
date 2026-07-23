import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { saveCommercialItemSeriesServer } from '@/lib/server/commercial-items';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ seriesId: await saveCommercialItemSeriesServer(body, requester) });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'SERIES SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar la serie comercial.',
    });
  }
}
