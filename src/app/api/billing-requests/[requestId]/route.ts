import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { getWorkflowAssignmentsServer } from '@/lib/server/workflow-assignments';
import type { WorkflowAssignments } from '@/lib/api-contracts';
import type { AdvertisingOrder, BillingRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const VALID_STATUSES = new Set(['Sugerido', 'Solicitado', 'Elevado', 'Confeccionado']);

function canUpdateBillingStatus(
  nextStatus: string,
  requesterId: string,
  isManager: boolean,
  assignments: WorkflowAssignments,
  order: AdvertisingOrder | null,
) {
  if (isManager) return true;

  if (nextStatus === 'Solicitado') {
    return order?.createdBy === requesterId;
  }

  if (nextStatus === 'Elevado') {
    return assignments.billingReceptors.includes(requesterId);
  }

  if (nextStatus === 'Confeccionado') {
    return assignments.billingReceptors.includes(requesterId) || assignments.tangoInvoicers.includes(requesterId);
  }

  return false;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    const billingStatus = String(body?.billingStatus || '');

    if (!VALID_STATUSES.has(billingStatus)) {
      return NextResponse.json({ error: 'Estado de facturacion invalido.' }, { status: 400 });
    }

    const requestRef = dbAdmin.collection('billing_requests').doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json({ error: 'Pedido de facturacion no encontrado.' }, { status: 404 });
    }

    const billingRequest = serializeDocument<BillingRequest>(requestSnap.id, requestSnap.data());
    const [assignments, orderSnap] = await Promise.all([
      getWorkflowAssignmentsServer(),
      billingRequest.orderId ? dbAdmin.collection('advertising_orders').doc(billingRequest.orderId).get() : null,
    ]);
    const order = orderSnap?.exists ? serializeDocument<AdvertisingOrder>(orderSnap.id, orderSnap.data()) : null;

    if (!canUpdateBillingStatus(
      billingStatus,
      requester.uid,
      hasServerManagementPrivileges(requester),
      assignments,
      order,
    )) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {
      billingStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body?.invoiceNumber) {
      updates.invoiceNumber = String(body.invoiceNumber);
    }

    await requestRef.update(updates);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('BILLING REQUEST STATUS UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar el pedido de facturacion.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
