import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { resolveProspectClaimOnServer } from '@/modules/prospects/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await requireServerManagement(request);
  if (isServerResponse(user)) return user;

  try {
    const { id } = await params;
    await resolveProspectClaimOnServer(id, 'approve', user);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
