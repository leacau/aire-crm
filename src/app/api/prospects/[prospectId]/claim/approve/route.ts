import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { approveProspectClaimServer } from '@/lib/server/prospects';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    await approveProspectClaimServer(prospectId, requester);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'CLAIM APPROVE',
      requesterId: requester.uid,
      publicError: 'No se pudo aprobar el reclamo del prospecto.',
    });
  }
}
