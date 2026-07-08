import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { PaymentEntry } from '@/lib/types';

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

type PaymentAudit = {
  ownerName?: string;
  details?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { paymentId } = await context.params;
  const body = await request.json();
  const updates = (body?.updates || {}) as Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>;
  const audit = (body?.audit || {}) as PaymentAudit;
  const shouldAudit = Boolean(body?.audit && typeof body.audit === 'object');

  await dbAdmin.collection('payment_entries').doc(paymentId).update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (shouldAudit) {
    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      ownerName: audit.ownerName,
      type: 'update',
      entityType: 'payment',
      entityId: paymentId,
      entityName: 'Mora',
      details: audit.details || 'Actualizo un registro de mora',
    });
  }

  return NextResponse.json({ ok: true });
}
