import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { jsonDataResponse } from '@/lib/server/json-response';
import { createClientOnServer, createClientSchema, listClientsForOrganization } from '@/modules/clients/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireServerCapability(request, 'clients.read');
    if (isServerResponse(user)) return user;
    return jsonDataResponse(await listClientsForOrganization(user.organizationId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireServerCapability(request, 'clients.create');
    if (isServerResponse(user)) return user;
    let json: unknown;
    try { json = await request.json(); } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const id = await createClientOnServer(createClientSchema.parse(json), user);
    return jsonDataResponse({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
