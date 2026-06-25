import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { listOpenTasksForUser } from '@/modules/tasks/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await requireServerCapability(request, 'tasks.read');
  if (isServerResponse(user)) return user;
  try {
    const tasks = await listOpenTasksForUser(user.organizationId, user.uid);
    return NextResponse.json({ data: tasks });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
