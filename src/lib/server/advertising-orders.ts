import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import {
  canAccessAdvertisingOrder,
  canCreateAdvertisingOrderForClient,
  filterAccessibleAdvertisingOrders,
} from '@/lib/server/advertising-order-access';
import { getRequesterName } from '@/lib/server/requester';
import { buildAdvertisingOrderChanges } from '@/lib/advertising-order-history';
import { getAdvertisingOrderFinancialSummary } from '@/lib/advertising-order-utils';
import type { AdvertisingOrder, ApprovalHistoryItem, BillingRequest } from '@/lib/types';

type BillingDraft = Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>;
type OrderPayload = Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>> & {
  billingRequestsAvion?: BillingDraft[];
};

export class AdvertisingOrderApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function mapAdvertisingOrder(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): AdvertisingOrder {
  return serializeDocument<AdvertisingOrder>(id, data);
}

export function isApprovedForProgramming(order: AdvertisingOrder): boolean {
  const status = order.status || 'Aprobado';
  return status === 'Aprobado' || status.startsWith('Pendiente de Mod');
}

export function compareByCreatedAtDesc(left: AdvertisingOrder, right: AdvertisingOrder): number {
  return (right.createdAt || '').localeCompare(left.createdAt || '');
}

export function compareByStartDateDesc(left: AdvertisingOrder, right: AdvertisingOrder): number {
  return (right.startDate || right.createdAt || '').localeCompare(left.startDate || left.createdAt || '');
}

type AdvertisingOrderListFilters = {
  opportunityId?: string | null;
  withEvent?: boolean;
  recent?: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
};

function splitOrderPayload<T extends OrderPayload>(orderData: T = {} as T) {
  const {
    billingRequestsSrl,
    billingRequestsSas,
    billingRequestsAvion,
    approvalHistory: _ignoredApprovalHistory,
    revisionHistory: _ignoredRevisionHistory,
    ...restOrderData
  } = orderData || {};

  return {
    billingRequestsSrl,
    billingRequestsSas,
    billingRequestsAvion,
    restOrderData: restOrderData as Partial<Omit<AdvertisingOrder, 'id' | 'createdAt'>>,
  };
}

function setBillingRequest(
  batch: FirebaseFirestore.WriteBatch,
  orderId: string,
  opportunityId: string,
  clientId: string,
  company: 'SRL' | 'SAS' | 'AVION',
  billing: BillingDraft,
) {
  const ref = dbAdmin.collection('billing_requests').doc();
  batch.set(ref, {
    orderId,
    opportunityId,
    clientId,
    company,
    date: billing.date,
    grossAmount: billing.grossAmount,
    adjustment: billing.adjustment,
    ...(company === 'SAS' ? { ivaSas: billing.ivaSas } : {}),
    amount: billing.amount,
    paymentType: billing.paymentType || (company === 'AVION' ? 'Canje' : 'Se paga'),
    canjeDescription: billing.canjeDescription || '',
    createdAt: FieldValue.serverTimestamp(),
  });
}

function collectBillingByCompany(snapshot: FirebaseFirestore.QuerySnapshot) {
  const billingRequestsSrl: AdvertisingOrder['billingRequestsSrl'] = [];
  const billingRequestsSas: AdvertisingOrder['billingRequestsSas'] = [];
  const billingRequestsAvion: AdvertisingOrder['billingRequestsAvion'] = [];

  snapshot.forEach(doc => {
    const billing = doc.data() as BillingRequest;
    const comparable = {
      date: billing.date,
      grossAmount: billing.grossAmount || 0,
      adjustment: billing.adjustment || 0,
      ivaSas: billing.ivaSas || 0,
      amount: billing.amount || 0,
      paymentType: billing.paymentType || (billing.company === 'AVION' ? 'Canje' : 'Se paga'),
      canjeDescription: billing.canjeDescription || '',
    };

    if (billing.company === 'SRL') billingRequestsSrl.push(comparable);
    else if (billing.company === 'SAS') billingRequestsSas.push(comparable);
    else if (billing.company === 'AVION') billingRequestsAvion.push(comparable);
  });

  return { billingRequestsSrl, billingRequestsSas, billingRequestsAvion };
}

export async function listAdvertisingOrdersServer(
  filters: AdvertisingOrderListFilters,
  requester: ServerUser,
): Promise<AdvertisingOrder[]> {
  if (filters.opportunityId) {
    const snapshot = await dbAdmin
      .collection('advertising_orders')
      .where('opportunityId', '==', filters.opportunityId)
      .get();
    return filterAccessibleAdvertisingOrders(
      snapshot.docs.map(doc => mapAdvertisingOrder(doc.id, doc.data())),
      requester,
    );
  }

  if (filters.withEvent) {
    const snapshot = await dbAdmin.collection('advertising_orders').where('event', '!=', '').get();
    return filterAccessibleAdvertisingOrders(
      snapshot.docs
        .map(doc => mapAdvertisingOrder(doc.id, doc.data()))
        .filter(order => Boolean(order.event?.trim()))
        .sort(compareByStartDateDesc),
      requester,
    );
  }

  if (filters.recent) {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const snapshot = await dbAdmin
      .collection('advertising_orders')
      .where('createdAt', '>=', twoMonthsAgo.toISOString())
      .orderBy('createdAt', 'desc')
      .get();

    return filterAccessibleAdvertisingOrders(
      snapshot.docs.map(doc => mapAdvertisingOrder(doc.id, doc.data())),
      requester,
    );
  }

  if (filters.rangeStart && filters.rangeEnd) {
    const snapshot = await dbAdmin
      .collection('advertising_orders')
      .where('startDate', '<=', filters.rangeEnd)
      .orderBy('startDate', 'desc')
      .get();

    return filterAccessibleAdvertisingOrders(
      snapshot.docs
        .map(doc => mapAdvertisingOrder(doc.id, doc.data()))
        .filter(order => {
          const orderEnd = order.endDate || order.startDate;
          return Boolean(orderEnd && orderEnd >= filters.rangeStart! && isApprovedForProgramming(order));
        })
        .sort(compareByStartDateDesc),
      requester,
    );
  }

  throw new AdvertisingOrderApiError('Filtro de ordenes no soportado.', 400);
}

export async function getAdvertisingOrderServer(
  orderId: string,
  requester: ServerUser,
): Promise<AdvertisingOrder | null> {
  const snap = await dbAdmin.collection('advertising_orders').doc(orderId).get();
  if (!snap.exists) return null;

  const order = mapAdvertisingOrder(snap.id, snap.data());
  if (!(await canAccessAdvertisingOrder(order, requester))) {
    throw new AdvertisingOrderApiError('Forbidden', 403);
  }

  return order;
}

export async function createAdvertisingOrderServer(
  orderData: Omit<AdvertisingOrder, 'id' | 'createdAt'>,
  requester: ServerUser,
): Promise<string> {
  if (!orderData?.clientId || !orderData.product) {
    throw new AdvertisingOrderApiError('Cliente y producto son obligatorios.', 400);
  }

  if (!(await canCreateAdvertisingOrderForClient(orderData.clientId, requester))) {
    throw new AdvertisingOrderApiError('Forbidden', 403);
  }

  const { billingRequestsSrl, billingRequestsSas, billingRequestsAvion, restOrderData } =
    splitOrderPayload(orderData);
  const docRef = dbAdmin.collection('advertising_orders').doc();
  const batch = dbAdmin.batch();

  batch.set(docRef, {
    ...restOrderData,
    createdBy: hasServerManagementPrivileges(requester) && restOrderData.createdBy ? restOrderData.createdBy : requester.uid,
    createdAt: new Date().toISOString(),
  });

  const opportunityId = restOrderData.opportunityId || '';
  const clientId = restOrderData.clientId || '';

  (billingRequestsSrl || []).forEach(billing =>
    setBillingRequest(batch, docRef.id, opportunityId, clientId, 'SRL', billing),
  );
  (billingRequestsSas || []).forEach(billing =>
    setBillingRequest(batch, docRef.id, opportunityId, clientId, 'SAS', billing),
  );
  (billingRequestsAvion || []).forEach(billing =>
    setBillingRequest(batch, docRef.id, opportunityId, clientId, 'AVION', billing),
  );

  if (restOrderData.canjeId) {
    batch.update(dbAdmin.collection('canjes').doc(restOrderData.canjeId), {
      advertisingOrderIds: FieldValue.arrayUnion(docRef.id),
    });
  }

  await batch.commit();

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    entityType: 'client',
    entityId: clientId,
    entityName: restOrderData.clientName || 'Cliente',
    type: 'create',
    details: `Creo un nuevo pedido de publicidad para el producto: ${restOrderData.product}`,
    timestamp: new Date().toISOString(),
  });

  return docRef.id;
}

export async function updateAdvertisingOrderServer(
  orderId: string,
  orderData: OrderPayload,
  requester: ServerUser,
  options?: {
    modificationReason?: string;
    userRole?: string;
    historyItem?: ApprovalHistoryItem;
  },
): Promise<void> {
  const shouldReplaceBilling = ['billingRequestsSrl', 'billingRequestsSas', 'billingRequestsAvion'].some(
    field => Object.prototype.hasOwnProperty.call(orderData || {}, field),
  );
  const { billingRequestsSrl, billingRequestsSas, billingRequestsAvion, restOrderData } =
    splitOrderPayload(orderData || {});

  const docRef = dbAdmin.collection('advertising_orders').doc(orderId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) throw new AdvertisingOrderApiError('Orden no encontrada.', 404);

  const previousOrder = serializeDocument<AdvertisingOrder>(docSnap.id, docSnap.data());
  if (!(await canAccessAdvertisingOrder(previousOrder, requester))) {
    throw new AdvertisingOrderApiError('Forbidden', 403);
  }

  const userName = getRequesterName(requester);
  const existingBrSnap = await dbAdmin.collection('billing_requests').where('orderId', '==', orderId).get();
  const previousBilling = collectBillingByCompany(existingBrSnap);
  const wasEverApproved =
    previousOrder.status === 'Aprobado' ||
    (previousOrder.approvalHistory || []).some(item => item.status === 'Aprobado');

  const updatePayload: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(restOrderData).filter(([, value]) => value !== undefined)),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (options?.historyItem) {
    updatePayload.approvalHistory = FieldValue.arrayUnion(options.historyItem);
  }

  if (wasEverApproved) {
    const reason = options?.modificationReason?.trim();
    if (!reason) {
      throw new AdvertisingOrderApiError('Debe indicar el motivo de la modificacion de una orden aprobada.', 400);
    }

    const previousComparableOrder = {
      ...previousOrder,
      ...previousBilling,
    };
    const nextComparableOrder = {
      ...previousOrder,
      ...restOrderData,
      billingRequestsSrl: shouldReplaceBilling
        ? billingRequestsSrl || []
        : previousBilling.billingRequestsSrl,
      billingRequestsSas: shouldReplaceBilling
        ? billingRequestsSas || []
        : previousBilling.billingRequestsSas,
      billingRequestsAvion: shouldReplaceBilling
        ? billingRequestsAvion || []
        : previousBilling.billingRequestsAvion,
    };
    const changes = buildAdvertisingOrderChanges(previousComparableOrder, nextComparableOrder);

    if (changes.length === 0) {
      throw new AdvertisingOrderApiError('No se detectaron cambios para registrar en la orden.', 400);
    }

    updatePayload.status = 'Pendiente de Modificacion';
    updatePayload.adminComments = FieldValue.delete();
    updatePayload.approvedAt = FieldValue.delete();
    updatePayload.approvedBy = FieldValue.delete();
    updatePayload.approvedByName = FieldValue.delete();
    updatePayload.revisionHistory = FieldValue.arrayUnion({
      timestamp: new Date().toISOString(),
      userId: requester.uid,
      userName,
      userRole: options?.userRole || '',
      reason,
      previousStatus: previousOrder.status || 'Aprobado',
      changes,
      financials: {
        before: getAdvertisingOrderFinancialSummary(previousComparableOrder),
        after: getAdvertisingOrderFinancialSummary(nextComparableOrder),
      },
      schedule: {
        before: {
          startDate: previousComparableOrder.startDate,
          endDate: previousComparableOrder.endDate,
          srlItems: previousComparableOrder.srlItems || [],
          sasItems: previousComparableOrder.sasItems || [],
        },
        after: {
          startDate: nextComparableOrder.startDate,
          endDate: nextComparableOrder.endDate,
          srlItems: nextComparableOrder.srlItems || [],
          sasItems: nextComparableOrder.sasItems || [],
        },
      },
    });
  }

  const batch = dbAdmin.batch();
  batch.update(docRef, updatePayload);

  if (shouldReplaceBilling) {
    existingBrSnap.forEach(doc => batch.delete(doc.ref));

    const opportunityId = restOrderData.opportunityId || previousOrder.opportunityId || '';
    const clientId = restOrderData.clientId || previousOrder.clientId;

    (billingRequestsSrl || []).forEach(billing =>
      setBillingRequest(batch, orderId, opportunityId, clientId, 'SRL', billing),
    );
    (billingRequestsSas || []).forEach(billing =>
      setBillingRequest(batch, orderId, opportunityId, clientId, 'SAS', billing),
    );
    (billingRequestsAvion || []).forEach(billing =>
      setBillingRequest(batch, orderId, opportunityId, clientId, 'AVION', billing),
    );
  }

  await batch.commit();

  await logServerActivity({
    userId: requester.uid,
    userName,
    type: 'update',
    entityType: 'opportunity' as any,
    entityId: orderId,
    entityName: 'Orden de Publicidad',
    details: `edito la orden de publicidad del cliente <strong>${restOrderData.clientName || previousOrder.clientName || 'Cliente'}</strong>`,
    ownerName: restOrderData.accountExecutive || previousOrder.accountExecutive || userName,
  });
}

export async function deleteAdvertisingOrderServer(
  orderId: string,
  requester: ServerUser,
): Promise<void> {
  const docRef = dbAdmin.collection('advertising_orders').doc(orderId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new AdvertisingOrderApiError('Orden no encontrada', 404);
  }

  if (!hasServerManagementPrivileges(requester)) {
    throw new AdvertisingOrderApiError('Forbidden', 403);
  }

  const order = mapAdvertisingOrder(snap.id, snap.data());
  await docRef.delete();

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'delete',
    entityType: 'opportunity' as any,
    entityId: orderId,
    entityName: 'Orden de Publicidad',
    details: `elimino una orden de publicidad del cliente <strong>${order.clientName || 'Cliente'}</strong>`,
    ownerName: 'Sistema',
  });
}
