import { getAdvertisingOrderFinancialSummary } from './advertising-order-utils';
import type {
  AdvertisingOrder,
  AdvertisingOrderItemSas,
  AdvertisingOrderItemSrl,
  ApprovalHistoryItem,
  ApprovalStatus,
  BillingRequest,
} from './types';

type BillingDraft = Omit<BillingRequest, 'orderId' | 'opportunityId' | 'clientId'>;

export type MobileAdvertisingOrderSummary = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  opportunityId?: string;
  opportunityTitle?: string;
  accountExecutive: string;
  status: ApprovalStatus;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  event?: string;
  totalSrl: number;
  totalSas: number;
  totalOrder: number;
  srlItemCount: number;
  sasItemCount: number;
  billingRequestCount: number;
  hasMaterial: boolean;
};

export type MobileAdvertisingOrderDetail = MobileAdvertisingOrderSummary & {
  agencyName?: string;
  materialUrl?: string;
  materialUrls: string[];
  observations?: string;
  adminComments?: string;
  approvedAt?: string;
  approvedByName?: string;
  srlItems: MobileAdvertisingOrderSrlItem[];
  sasItems: MobileAdvertisingOrderSasItem[];
  billingRequests: {
    srl: BillingDraft[];
    sas: BillingDraft[];
    avion: BillingDraft[];
  };
  approvalHistory: ApprovalHistoryItem[];
};

export type MobileAdvertisingOrderSrlItem = {
  month?: string;
  programId?: string;
  type: string;
  seconds?: number;
  repetitions: number;
  unitRate?: number;
};

export type MobileAdvertisingOrderSasItem = {
  month?: string;
  format?: string;
  type: string;
  detail?: string;
  unitRate?: number;
};

const sumBilling = (items: BillingDraft[] = []) =>
  items.reduce((total, item) => total + (Number(item.amount) || 0), 0);

const countRepetitions = (item: AdvertisingOrderItemSrl) =>
  Object.values(item.dailySpots || {}).reduce((total, quantity) => total + (Number(quantity) || 0), 0);

const getOrderStatus = (order: AdvertisingOrder): ApprovalStatus => order.status || 'Pendiente';

const getOrderTitle = (order: AdvertisingOrder) =>
  order.product || order.opportunityTitle || 'Orden de publicidad';

const getOrderClientName = (order: AdvertisingOrder) =>
  order.clientName || order.clientRazonSocial || 'Cliente sin nombre';

const getSrlTotal = (order: AdvertisingOrder) => {
  if (typeof order.totalSrl === 'number') return order.totalSrl;
  const summary = getAdvertisingOrderFinancialSummary(order);
  return summary.srl.net;
};

const getSasTotal = (order: AdvertisingOrder) => {
  if (typeof order.totalSas === 'number') return order.totalSas;
  const summary = getAdvertisingOrderFinancialSummary(order);
  return summary.sas.net;
};

const getOrderTotal = (order: AdvertisingOrder, totalSrl: number, totalSas: number) => {
  if (typeof order.totalOrder === 'number') return order.totalOrder;
  const billingTotal = sumBilling(order.billingRequestsSrl)
    + sumBilling(order.billingRequestsSas)
    + sumBilling(order.billingRequestsAvion);
  return billingTotal || totalSrl + totalSas;
};

export function toMobileAdvertisingOrderSummary(order: AdvertisingOrder): MobileAdvertisingOrderSummary {
  const totalSrl = getSrlTotal(order);
  const totalSas = getSasTotal(order);
  const totalOrder = getOrderTotal(order, totalSrl, totalSas);
  const materialUrls = [
    ...(order.materialUrl ? [order.materialUrl] : []),
    ...(order.materialUrls || []),
  ].filter(Boolean);

  return {
    id: order.id || '',
    title: getOrderTitle(order),
    clientId: order.clientId,
    clientName: getOrderClientName(order),
    opportunityId: order.opportunityId,
    opportunityTitle: order.opportunityTitle,
    accountExecutive: order.accountExecutive || '-',
    status: getOrderStatus(order),
    createdAt: order.createdAt,
    startDate: order.startDate,
    endDate: order.endDate,
    event: order.event,
    totalSrl,
    totalSas,
    totalOrder,
    srlItemCount: order.srlItems?.length || 0,
    sasItemCount: order.sasItems?.length || 0,
    billingRequestCount: (order.billingRequestsSrl?.length || 0)
      + (order.billingRequestsSas?.length || 0)
      + (order.billingRequestsAvion?.length || 0),
    hasMaterial: Boolean(order.materialSent || materialUrls.length),
  };
}

export function toMobileAdvertisingOrderDetail(order: AdvertisingOrder): MobileAdvertisingOrderDetail {
  const summary = toMobileAdvertisingOrderSummary(order);

  return {
    ...summary,
    agencyName: order.agencyName,
    materialUrl: order.materialUrl,
    materialUrls: Array.from(new Set([
      ...(order.materialUrl ? [order.materialUrl] : []),
      ...(order.materialUrls || []),
    ].filter(Boolean))),
    observations: order.observations,
    adminComments: order.adminComments,
    approvedAt: order.approvedAt,
    approvedByName: order.approvedByName,
    srlItems: (order.srlItems || []).map(toMobileSrlItem),
    sasItems: (order.sasItems || []).map(toMobileSasItem),
    billingRequests: {
      srl: order.billingRequestsSrl || [],
      sas: order.billingRequestsSas || [],
      avion: order.billingRequestsAvion || [],
    },
    approvalHistory: order.approvalHistory || [],
  };
}

function toMobileSrlItem(item: AdvertisingOrderItemSrl): MobileAdvertisingOrderSrlItem {
  return {
    month: item.month,
    programId: item.programId,
    type: item.customType || item.adType || 'Pauta SRL',
    seconds: item.seconds,
    repetitions: countRepetitions(item),
    unitRate: item.unitRate,
  };
}

function toMobileSasItem(item: AdvertisingOrderItemSas): MobileAdvertisingOrderSasItem {
  return {
    month: item.month,
    format: item.format,
    type: item.customDetail || item.detail || item.type || 'Pauta SAS',
    detail: item.observations || item.url,
    unitRate: item.unitRate,
  };
}
