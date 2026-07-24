import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { getRequesterName } from '@/lib/server/clients';
import {
  createCoachingSessionServer,
  listCoachingSessions,
} from '@/lib/server/coaching';
import { coachingErrorResponse } from '@/app/api/coaching-sessions/utils';
import type { CoachingSession } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const advisorId = searchParams.get('advisorId') || '';
    const sessions = await listCoachingSessions(advisorId, requester);
    return NextResponse.json({ sessions });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'SESSIONS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las sesiones de coaching.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const id = await createCoachingSessionServer(
      body?.sessionData as Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
      requester.uid,
      getRequesterName(requester),
      requester,
    );
    return NextResponse.json({ id });
  } catch (error) {
    return coachingErrorResponse(error, {
      action: 'SESSION CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la sesion de coaching.',
    });
  }
}
