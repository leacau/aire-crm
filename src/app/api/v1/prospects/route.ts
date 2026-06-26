import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { jsonDataResponse } from '@/lib/server/json-response';
import {
  createProspectOnServer,
  createProspectSchema,
  listProspectsForOrganization,
} from '@/modules/prospects/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireServerCapability(request, 'prospects.read');
    if (isServerResponse(user)) return user;
    const prospects = await listProspectsForOrganization(user.organizationId);
    return jsonDataResponse(prospects);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireServerCapability(request, 'prospects.create');
    if (isServerResponse(user)) return user;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const input = createProspectSchema.parse(json);
    const id = await createProspectOnServer(input, user);
    return jsonDataResponse({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
