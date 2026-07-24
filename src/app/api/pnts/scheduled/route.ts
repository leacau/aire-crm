import { NextResponse } from 'next/server';
import { pntErrorResponse } from '@/app/api/pnts/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listScheduledPntsServer } from '@/lib/server/scheduled-pnts';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({ scheduledPnts: await listScheduledPntsServer(searchParams.get('date')) });
  } catch (error) {
    return pntErrorResponse(error, {
      action: 'SCHEDULED PNTS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los PNTs programados.',
    });
  }
}
