import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { systemErrorResponse } from '@/app/api/system/errors';
import { getHolidayDatesServer, saveHolidayDatesServer } from '@/lib/server/system-config';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ dates: await getHolidayDatesServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'HOLIDAYS LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los feriados del sistema.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ dates: await saveHolidayDatesServer(body?.dates, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'HOLIDAYS SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar los feriados del sistema.',
    });
  }
}
