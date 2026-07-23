import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { setUserMonthlyClosureServer } from '@/lib/server/users';
import { userErrorResponse } from '@/app/api/users/errors';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    const body = await request.json();
    await setUserMonthlyClosureServer(userId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'MONTHLY CLOSURE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el cierre mensual del asesor.',
    });
  }
}
