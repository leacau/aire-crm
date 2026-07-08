import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { autoUpdateCoachingSessionServer, CoachingApiError } from '@/lib/server/coaching';

type AutoCoachingEntityType = 'client' | 'prospect';

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching auto-update API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

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
    return errorResponse(error);
  }
}
