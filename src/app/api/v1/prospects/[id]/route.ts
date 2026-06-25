import { NextResponse } from 'next/server';

import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import {
  deleteProspectOnServer,
  updateProspectOnServer,
  updateProspectSchema,
} from '@/modules/prospects/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'prospects.update');
  if (isServerResponse(user)) return user;

  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const input = updateProspectSchema.parse(json);
    const { id } = await params;
    await updateProspectOnServer(id, input, user);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'prospects.delete');
  if (isServerResponse(user)) return user;

  try {
    const { id } = await params;
    await deleteProspectOnServer(id, user);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
