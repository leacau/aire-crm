import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import {
  getWorkflowAssignmentsServer,
  normalizeWorkflowAssignments,
  saveWorkflowAssignmentsServer,
} from '@/lib/server/workflow-assignments';
import type { WorkflowAssignments } from '@/lib/api/system';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  return NextResponse.json({ assignments: await getWorkflowAssignmentsServer() });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const assignments = normalizeWorkflowAssignments(body?.assignments);

  await saveWorkflowAssignmentsServer(assignments);

  return NextResponse.json({ assignments });
}
