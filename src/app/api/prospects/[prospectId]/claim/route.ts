import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { claimProspectServer } from '@/lib/server/prospects';

type RouteContext = {
  params: Promise<{ prospectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { prospectId } = await context.params;
    await claimProspectServer(prospectId, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'CLAIM',
      requesterId: requester.uid,
      publicError: 'No se pudo reclamar el prospecto.',
    });
  }
}
