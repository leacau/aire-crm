import { NextResponse } from 'next/server';

import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { createPersonForClient, createPersonSchema, listPeopleForClient } from '@/modules/clients/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'clients.read');
  if (isServerResponse(user)) return user;
  try {
    const { id } = await params;
    return NextResponse.json({ data: await listPeopleForClient(id, user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'clients.update');
  if (isServerResponse(user)) return user;
  try {
    let json: unknown;
    try { json = await request.json(); } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const { id } = await params;
    const personId = await createPersonForClient(id, createPersonSchema.parse(json), user);
    return NextResponse.json({ data: { id: personId } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
