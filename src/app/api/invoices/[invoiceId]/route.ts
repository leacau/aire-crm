import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { buildInvoiceUpdatePayload } from '@/app/api/invoices/utils';
import type { Invoice } from '@/lib/types';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { invoiceId } = await context.params;
  const body = await request.json();
  const data = (body?.data || {}) as Partial<Omit<Invoice, 'id'>>;
  const docRef = dbAdmin.collection('invoices').doc(invoiceId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  await docRef.update(buildInvoiceUpdatePayload(data));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { invoiceId } = await context.params;
  const body = await request.json().catch(() => null);
  const ownerName = typeof body?.ownerName === 'string' ? body.ownerName : 'Cliente';
  const docRef = dbAdmin.collection('invoices').doc(invoiceId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ ok: true });
  }

  const invoiceData = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'invoice',
    entityId: invoiceId,
    entityName: `Factura #${invoiceData.invoiceNumber || invoiceId}`,
    details: `elimino la factura #${invoiceData.invoiceNumber || invoiceId}`,
    ownerName,
  });

  return NextResponse.json({ ok: true });
}
