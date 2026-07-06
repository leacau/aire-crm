import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ activityId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { activityId } = await context.params;
  const body = await request.json();
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Fecha invalida.' }, { status: 400 });
  }

  await dbAdmin.collection('client-activities').doc(activityId).update({
    dueDate: Timestamp.fromDate(dueDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}

