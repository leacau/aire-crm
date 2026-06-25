import { NextResponse } from 'next/server';

import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { deletePersonForClient, updatePersonForClient, updatePersonSchema } from '@/modules/clients/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ id: string; personId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'clients.update');
  if (isServerResponse(user)) return user;
  try {
    let json: unknown;
    try { json = await request.json(); } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const { id, personId } = await params;
    await updatePersonForClient(id, personId, updatePersonSchema.parse(json), user);
    return NextResponse.json({ data: { id: personId } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'clients.update');
  if (isServerResponse(user)) return user;
  try {
    const { id, personId } = await params;
    await deletePersonForClient(id, personId, user);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
