import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const VALID_STATUSES = new Set(['Sugerido', 'Solicitado', 'Elevado', 'Confeccionado']);

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { requestId } = await context.params;
  const body = await request.json();
  const billingStatus = String(body?.billingStatus || '');

  if (!VALID_STATUSES.has(billingStatus)) {
    return NextResponse.json({ error: 'Estado de facturacion invalido.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    billingStatus,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body?.invoiceNumber) {
    updates.invoiceNumber = String(body.invoiceNumber);
  }

  await dbAdmin.collection('billing_requests').doc(requestId).update(updates);

  return NextResponse.json({ ok: true });
}
