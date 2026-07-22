import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { activityErrorResponse } from '@/app/api/activities/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import type { ClientActivity } from '@/lib/types';

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

function buildActivityUpdate(data: Partial<Omit<ClientActivity, 'id'>>) {
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.completed) {
    updateData.completedAt = FieldValue.serverTimestamp();
    updateData.completedByUserId = data.completedByUserId;
    updateData.completedByUserName = data.completedByUserName;
  } else if (data.completed === false) {
    updateData.completedAt = FieldValue.delete();
    updateData.completedByUserId = FieldValue.delete();
    updateData.completedByUserName = FieldValue.delete();
  }

  if (data.dueDate) {
    updateData.dueDate = Timestamp.fromDate(new Date(data.dueDate));
  }

  if (data.googleCalendarEventId === null) {
    updateData.googleCalendarEventId = FieldValue.delete();
  }

  return Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== undefined),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { activityId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<ClientActivity, 'id'>>;

    await dbAdmin.collection('client-activities').doc(activityId).update(buildActivityUpdate(data));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return activityErrorResponse(error, {
      action: 'CLIENT ACTIVITY UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la actividad.',
    });
  }
}
