import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { prospectErrorResponse } from '@/app/api/prospects/errors';
import { createProspectServer, listProspectsServer } from '@/lib/server/prospects';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ prospects: await listProspectsServer() });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los prospectos.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createProspectServer(body?.prospectData, requester) });
  } catch (error) {
    return prospectErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el prospecto.',
    });
  }
}
