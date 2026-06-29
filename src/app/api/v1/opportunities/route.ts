import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { jsonDataResponse } from '@/lib/server/json-response';
import { createOpportunitySchema } from '@/modules/opportunities/application/opportunity-schemas';
import {
  createOpportunityForOrganization,
  listOpportunitiesForOrganization,
} from '@/modules/opportunities/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireServerCapability(request, 'opportunities.read');
    if (isServerResponse(user)) return user;
    const url = new URL(request.url);
    const rawScope = url.searchParams.get('scope') || 'active';
    if (rawScope !== 'active' && rawScope !== 'all') {
      throw new ApiError(400, 'El alcance solicitado no es válido.', 'INVALID_SCOPE');
    }
    const clientId = url.searchParams.get('clientId') || undefined;
    const opportunities = await listOpportunitiesForOrganization(user.organizationId, rawScope, clientId);
    return jsonDataResponse(opportunities);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireServerCapability(request, 'opportunities.create');
    if (isServerResponse(user)) return user;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const input = createOpportunitySchema.parse(payload);
    const id = await createOpportunityForOrganization(input, user);
    return jsonDataResponse({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
