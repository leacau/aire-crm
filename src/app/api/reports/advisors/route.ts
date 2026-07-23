import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { buildAdvisorReportsServer } from '@/lib/server/advisor-reports';
import { reportErrorResponse } from '@/app/api/reports/errors';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json().catch(() => null);
    return NextResponse.json({ reports: await buildAdvisorReportsServer(body, requester) });
  } catch (error) {
    return reportErrorResponse(error, {
      action: 'ADVISORS',
      requesterId: requester.uid,
      publicError: 'No se pudo generar el reporte de asesores.',
    });
  }
}
