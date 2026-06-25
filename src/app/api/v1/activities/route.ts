import { NextResponse } from 'next/server';

import { ApiError, apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { createActivityOnServer, createActivitySchema, listActivitiesForOrganization } from '@/modules/tasks/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requireServerCapability(request, 'tasks.read');
  if (isServerResponse(user)) return user;

  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId') || undefined;
    const prospectId = url.searchParams.get('prospectId') || undefined;
    const activities = await listActivitiesForOrganization(user.organizationId, { clientId, prospectId });
    return NextResponse.json({ data: activities });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await requireServerCapability(request, 'tasks.create');
  if (isServerResponse(user)) return user;

  try {
    let json: unknown;
    try { json = await request.json(); } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const id = await createActivityOnServer(createActivitySchema.parse(json), user);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
