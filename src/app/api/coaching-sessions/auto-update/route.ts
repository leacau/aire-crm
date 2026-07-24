import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { autoUpdateCoachingSessionServer } from '@/lib/server/coaching';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/errors';

type AutoCoachingEntityType = 'client' | 'prospect';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await autoUpdateCoachingSessionServer(
      String(body?.advisorId || ''),
      String(body?.advisorName || ''),
      body?.entityType as AutoCoachingEntityType,
      String(body?.entityId || ''),
      String(body?.entityName || ''),
      String(body?.actionText || ''),
      body?.options || undefined,
      requester,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'AUTO UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar automaticamente la sesion de coaching.',
    });
  }
}
