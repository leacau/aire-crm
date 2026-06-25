import { NextResponse } from 'next/server';

import { ApiError, apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { updateActivityOnServer, updateActivitySchema } from '@/modules/tasks/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'tasks.update');
  if (isServerResponse(user)) return user;

  try {
    let json: unknown;
    try { json = await request.json(); } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no contiene JSON válido.', 'INVALID_JSON');
    }
    const { id } = await params;
    await updateActivityOnServer(id, updateActivitySchema.parse(json), user);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
