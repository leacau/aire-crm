import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { invoiceErrorResponse } from '@/app/api/invoices/errors';
import { buildInvoiceUpdatePayload, mapInvoice } from '@/app/api/invoices/utils';
import { canAccessInvoiceMutation, canAccessInvoiceMutationByOpportunity } from '@/lib/server/invoice-access';
import type { Invoice } from '@/lib/types';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { invoiceId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<Invoice, 'id'>>;
    const docRef = dbAdmin.collection('invoices').doc(invoiceId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    const invoice = mapInvoice(snap.id, snap.data());
    const targetOpportunityId = data.opportunityId || invoice.opportunityId;
    if (!(await canAccessInvoiceMutationByOpportunity(targetOpportunityId, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (data.opportunityId !== undefined && data.opportunityId !== invoice.opportunityId && !hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.update(buildInvoiceUpdatePayload(data));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la factura.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { invoiceId } = await context.params;
    const body = await request.json().catch(() => null);
    const ownerName = typeof body?.ownerName === 'string' ? body.ownerName : 'Cliente';
    const docRef = dbAdmin.collection('invoices').doc(invoiceId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true });
    }

    const invoice = mapInvoice(snap.id, snap.data());
    if (!hasServerManagementPrivileges(requester) && !(await canAccessInvoiceMutation(invoice, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la factura.',
    });
  }
}
