import { NextResponse } from 'next/server';
import { commercialItemErrorResponse } from '@/app/api/commercial-items/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listScheduledPntsServer } from '@/lib/server/scheduled-pnts';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({ scheduledPnts: await listScheduledPntsServer(searchParams.get('date')) });
  } catch (error) {
    return commercialItemErrorResponse(error, {
      action: 'SCHEDULED PNTS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los PNTs programados.',
    });
  }
}
