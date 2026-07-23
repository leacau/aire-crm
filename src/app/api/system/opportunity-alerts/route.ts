import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import {
  getOpportunityAlertsConfigServer,
  saveOpportunityAlertsConfigServer,
} from '@/lib/server/system-config';
import { systemErrorResponse } from '@/app/api/system/errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ config: await getOpportunityAlertsConfigServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'OPPORTUNITY ALERTS GET',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la configuracion de alertas de oportunidades.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ config: await saveOpportunityAlertsConfigServer(body?.config, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'OPPORTUNITY ALERTS SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar la configuracion de alertas de oportunidades.',
    });
  }
}
