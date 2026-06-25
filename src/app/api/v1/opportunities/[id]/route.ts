import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { getOpportunityForOrganization } from '@/modules/opportunities/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'opportunities.read');
  if (isServerResponse(user)) return user;
  try {
    const { id } = await params;
    return NextResponse.json({ data: await getOpportunityForOrganization(id, user.organizationId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
