import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import {
  getWorkflowAssignmentsServer,
  normalizeWorkflowAssignments,
  saveWorkflowAssignmentsServer,
} from '@/lib/server/workflow-assignments';
import { systemErrorResponse } from '@/app/api/system/errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ assignments: await getWorkflowAssignmentsServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'WORKFLOW ASSIGNMENTS GET',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las asignaciones de workflow.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const assignments = normalizeWorkflowAssignments(body?.assignments);

    await saveWorkflowAssignmentsServer(assignments);

    return NextResponse.json({ assignments });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'WORKFLOW ASSIGNMENTS SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar las asignaciones de workflow.',
    });
  }
}
