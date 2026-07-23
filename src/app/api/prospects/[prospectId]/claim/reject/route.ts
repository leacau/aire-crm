import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { rejectProspectClaimServer } from '@/lib/server/prospects';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    await rejectProspectClaimServer(prospectId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'CLAIM REJECT',
      requesterId: requester.uid,
      publicError: 'No se pudo rechazar el reclamo del prospecto.',
    });
  }
}
