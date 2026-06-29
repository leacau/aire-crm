import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { jsonDataResponse } from '@/lib/server/json-response';
import { updateOpportunityRequestSchema, updateOpportunitySchema } from '@/modules/opportunities/application/opportunity-schemas';
import {
  deleteOpportunityForOrganization,
  getOpportunityForOrganization,
  updateOpportunityForOrganization,
} from '@/modules/opportunities/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireServerCapability(request, 'opportunities.read');
    if (isServerResponse(user)) return user;
    const { id } = await params;
    return jsonDataResponse(await getOpportunityForOrganization(id, user.organizationId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireServerCapability(request, 'opportunities.update');
    if (isServerResponse(user)) return user;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }

    const requestPayload = payload && typeof payload === 'object' && 'data' in payload
      ? updateOpportunityRequestSchema.parse(payload)
      : { data: updateOpportunitySchema.parse(payload), pendingInvoices: undefined, options: undefined };
    const { id } = await params;
    const updated = await updateOpportunityForOrganization(
      id,
      requestPayload.data,
      user,
      requestPayload.pendingInvoices,
      requestPayload.options,
    );
    return jsonDataResponse(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireServerCapability(request, 'opportunities.delete');
    if (isServerResponse(user)) return user;
    const { id } = await params;
    await deleteOpportunityForOrganization(id, user);
    return jsonDataResponse({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
