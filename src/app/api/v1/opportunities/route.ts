import { NextResponse } from 'next/server';

import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { listOpportunitiesForOrganization } from '@/modules/opportunities/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requireServerCapability(request, 'opportunities.read');
  if (isServerResponse(user)) return user;
  try {
    const url = new URL(request.url);
    const rawScope = url.searchParams.get('scope') || 'active';
    if (rawScope !== 'active' && rawScope !== 'all') {
      throw new ApiError(400, 'El alcance solicitado no es válido.', 'INVALID_SCOPE');
    }
    const clientId = url.searchParams.get('clientId') || undefined;
    const opportunities = await listOpportunitiesForOrganization(user.organizationId, rawScope, clientId);
    return NextResponse.json({ data: opportunities });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
