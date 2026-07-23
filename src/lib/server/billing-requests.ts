import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { canAccessAdvertisingOrder } from '@/lib/server/advertising-order-access';
import { serializeDocument } from '@/lib/server/firestore';
import { getWorkflowAssignmentsServer } from '@/lib/server/workflow-assignments';
import type { WorkflowAssignments } from '@/lib/api-contracts';
import type { AdvertisingOrder, BillingRequest, Client } from '@/lib/types';

const VALID_STATUSES = new Set(['Sugerido', 'Solicitado', 'Elevado', 'Confeccionado']);

export class BillingRequestApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

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

export async function listBillingRequestsServer(requester: ServerUser) {
  const [requestsSnap, ordersSnap, clientsSnap, assignments] = await Promise.all([
    dbAdmin.collection('billing_requests').get(),
    dbAdmin.collection('advertising_orders').get(),
    dbAdmin.collection('clients').get(),
    getWorkflowAssignmentsServer(),
  ]);

  const ordersMap = new Map(
    ordersSnap.docs.map(doc => [doc.id, serializeDocument<AdvertisingOrder>(doc.id, doc.data())]),
  );
  const clientsMap = new Map(
    clientsSnap.docs.map(doc => [doc.id, serializeDocument<Client>(doc.id, doc.data())]),
  );

  const canSeeAll = hasServerManagementPrivileges(requester) || assignments.billingReceptors.includes(requester.uid);
  return requestsSnap.docs
    .map(doc => {
      const billing = serializeDocument<BillingRequest>(doc.id, doc.data());
      const order = billing.orderId ? ordersMap.get(billing.orderId) : undefined;
      const client = billing.clientId ? clientsMap.get(billing.clientId) : undefined;

      return {
        ...billing,
        accountExecutive: order?.accountExecutive || 'Sistema',
        advisorId: order?.createdBy || '',
        opportunityTitle: order?.opportunityTitle || order?.product || 'Campana',
        clientDisplayName:
          client?.razonSocialTango || client?.razonSocial || client?.denominacion || 'Desconocido',
        cuit: client?.cuit || '-',
        billingStatus: (billing as { billingStatus?: string }).billingStatus || 'Sugerido',
        invoiceNumber: (billing as { invoiceNumber?: string }).invoiceNumber || '',
      };
    })
    .filter(request => canSeeAll || request.advisorId === requester.uid)
    .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
}

export async function updateBillingRequestStatusServer(
  requestId: string,
  rawBody: unknown,
  requester: ServerUser,
) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const billingStatus = String(body.billingStatus || '');

  if (!VALID_STATUSES.has(billingStatus)) {
    throw new BillingRequestApiError('Estado de facturacion invalido.', 400);
  }

  const requestRef = dbAdmin.collection('billing_requests').doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new BillingRequestApiError('Pedido de facturacion no encontrado.', 404);
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
    throw new BillingRequestApiError('Forbidden', 403);
  }

  const updates: Record<string, unknown> = {
    billingStatus,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.invoiceNumber) {
    updates.invoiceNumber = String(body.invoiceNumber);
  }

  await requestRef.update(updates);
}

export async function listBillingRequestsByOrderServer(orderId: string, requester: ServerUser) {
  if (!orderId) return [];

  const [orderSnap, assignments] = await Promise.all([
    dbAdmin.collection('advertising_orders').doc(orderId).get(),
    getWorkflowAssignmentsServer(),
  ]);

  if (!orderSnap.exists) return [];

  const canUseWorkflowView =
    assignments.approvers.includes(requester.uid) ||
    assignments.billingReceptors.includes(requester.uid) ||
    assignments.tangoInvoicers.includes(requester.uid);
  const order = serializeDocument<AdvertisingOrder>(orderSnap.id, orderSnap.data());

  if (!canUseWorkflowView && !(await canAccessAdvertisingOrder(order, requester))) {
    throw new BillingRequestApiError('Forbidden', 403);
  }

  const snapshot = await dbAdmin.collection('billing_requests').where('orderId', '==', orderId).get();
  return snapshot.docs
    .map(doc => serializeDocument<BillingRequest>(doc.id, doc.data()))
    .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
}
