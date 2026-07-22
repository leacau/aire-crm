import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

const HOLIDAYS_DOC_ID = 'holidays';

function normalizeDates(rawDates: unknown): string[] {
  if (!Array.isArray(rawDates)) return [];

  const seen = new Set<string>();
  return rawDates
    .map(date => String(date).trim().slice(0, 10))
    .filter(date => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) return false;
      seen.add(date);
      return true;
    })
    .sort();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido';
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : undefined;
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const snap = await dbAdmin.collection('system_config').doc(HOLIDAYS_DOC_ID).get();
    const dates = snap.exists ? normalizeDates(snap.data()?.dates) : [];

    return NextResponse.json({ dates });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('SYSTEM HOLIDAYS LIST ERROR:', {
      requester: requester.uid,
      code: getErrorCode(error),
      message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los feriados del sistema.',
      details: message,
    }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    if (!Array.isArray(body?.dates)) {
      return NextResponse.json({ error: 'La lista de feriados es obligatoria.' }, { status: 400 });
    }

    const dates = normalizeDates(body.dates);
    await dbAdmin.collection('system_config').doc(HOLIDAYS_DOC_ID).set({ dates }, { merge: true });

    await logServerActivity({
      userId: requester.uid,
      userName: requester.name || requester.email || 'Usuario',
      type: 'update',
      entityType: 'system_config',
      entityId: HOLIDAYS_DOC_ID,
      entityName: 'Feriados',
      details: 'actualizo la lista de feriados del sistema.',
      ownerName: 'Sistema',
    });

    return NextResponse.json({ dates });
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('SYSTEM HOLIDAYS SAVE ERROR:', {
      requester: requester.uid,
      code: getErrorCode(error),
      message,
    });
    return NextResponse.json({
      error: 'No se pudieron guardar los feriados del sistema.',
      details: message,
    }, { status: 502 });
  }
}
