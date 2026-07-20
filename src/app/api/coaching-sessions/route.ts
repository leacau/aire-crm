import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import {
  CoachingApiError,
  createCoachingSessionServer,
  listCoachingSessions,
} from '@/lib/server/coaching';
import type { CoachingSession } from '@/lib/types';

function getRequesterName(requester: { name?: string; email?: string }) {
  return requester.name || requester.email || 'Usuario';
}

function errorResponse(error: unknown) {
  if (error instanceof CoachingApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('Coaching sessions API error:', error);
  return NextResponse.json({ error: 'No se pudo completar la operacion.' }, { status: 500 });
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const advisorId = searchParams.get('advisorId') || '';
    const sessions = await listCoachingSessions(advisorId, requester);
    return NextResponse.json({ sessions });
  } catch (error) {
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
