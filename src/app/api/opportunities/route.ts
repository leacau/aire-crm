import { NextResponse } from 'next/server';
import { opportunityErrorResponse } from '@/app/api/opportunities/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createOpportunityServer, listOpportunitiesServer } from '@/lib/server/opportunities';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'active';
    return NextResponse.json({
      opportunities: await listOpportunitiesServer(scope, searchParams.get('userId'), requester),
    });
  } catch (error) {
    return opportunityErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las oportunidades.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createOpportunityServer(body, requester) });
  } catch (error) {
    return opportunityErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la oportunidad.',
    });
  }
}
