import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { getRequesterName } from '@/app/api/clients/utils';

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { activityId } = await context.params;
  const requesterName = getRequesterName(requester);

  await dbAdmin.collection('client-activities').doc(activityId).update({
    completed: true,
    completedAt: FieldValue.serverTimestamp(),
    completedByUserId: requester.uid,
    completedByUserName: requesterName,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'client_activity' as any,
    entityId: activityId,
    entityName: 'Tarea completada',
    details: 'marco la tarea como finalizada',
    ownerName: requesterName,
  });

  return NextResponse.json({ ok: true });
}

