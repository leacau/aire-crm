import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { bulkReleaseProspectsServer } from '@/lib/server/prospects';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await bulkReleaseProspectsServer(body?.prospectIds, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'BULK RELEASE',
      requesterId: requester.uid,
      publicError: 'No se pudieron liberar los prospectos.',
    });
  }
}
