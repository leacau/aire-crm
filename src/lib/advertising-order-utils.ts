import type {
  ApprovalStatus,
  AdvertisingOrder,
  AdvertisingOrderFinancialSummary,
  AdvertisingOrderItemSas,
} from './types';

export const isLegacyApprovedAdvertisingOrder = (order: Partial<AdvertisingOrder>) =>
  !order.status && (!order.approvalHistory || order.approvalHistory.length === 0);

export const hasAdvertisingOrderBeenApproved = (order: Partial<AdvertisingOrder>) =>
  isLegacyApprovedAdvertisingOrder(order)
  || order.status === 'Aprobado'
  || (order.approvalHistory || []).some(item => item.status === 'Aprobado');

export const getAdvertisingOrderApprovalStatus = (order: Partial<AdvertisingOrder>): ApprovalStatus => {
  if (isLegacyApprovedAdvertisingOrder(order)) return 'Aprobado';
  return order.status || 'Pendiente';
};

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const isSocialMediaSasItem = (item: AdvertisingOrderItemSas) => {
  const searchable = normalize([
    item.format,
    item.type,
    item.detail,
    item.customDetail,
    item.observations,
  ].filter(Boolean).join(' '));

  return [
    'redes',
    'red social',
    'instagram',
    'facebook',
    'tiktok',
    'linkedin',
    'historia',
    'story',
    'stories',
    'reel',
    'carrusel',
    'carousel',
    'feed',
  ].some(keyword => searchable.includes(keyword));
};

const orderText = (order: Partial<AdvertisingOrder>) => normalize([
  ...(order.srlItems || []).map(item => [
    item.adType,
    item.customType,
    item.programId,
  ].filter(Boolean).join(' ')),
  ...(order.sasItems || []).map(item => [
    item.format,
    item.type,
    item.detail,
    item.customDetail,
    item.observations,
  ].filter(Boolean).join(' ')),
].join(' '));

export type ExecutionKind = 'commercial-note' | 'social-media' | 'web-note';

export const advertisingOrderSupportsExecution = (
  order: Partial<AdvertisingOrder>,
  kind: ExecutionKind,
) => {
  const text = orderText(order);
  if (kind === 'commercial-note') {
    return (order.srlItems || []).some(item => normalize([item.adType, item.customType].join(' ')).includes('nota'));
  }
  if (kind === 'social-media') {
    return (order.sasItems || []).some(isSocialMediaSasItem);
  }
  return [
    'nota web',
    'web',
    'gacetilla',
    'prensa',
  ].some(keyword => text.includes(keyword));
};

export const getSuggestedSocialMediaType = (
  items: AdvertisingOrderItemSas[],
): 'Reel' | 'Story' | 'Carrusel' | undefined => {
  const searchable = normalize(items.filter(isSocialMediaSasItem).map(item => [
    item.format,
    item.type,
    item.detail,
    item.customDetail,
    item.observations,
  ].filter(Boolean).join(' ')).join(' '));

  if (searchable.includes('historia') || searchable.includes('story') || searchable.includes('stories')) return 'Story';
  if (searchable.includes('carrusel') || searchable.includes('carousel')) return 'Carrusel';
  if (searchable.includes('reel')) return 'Reel';
  return undefined;
};

export const getAdvertisingOrderFinancialSummary = (
  order: Partial<AdvertisingOrder>,
): AdvertisingOrderFinancialSummary => {
  const srlGross = (order.srlItems || []).reduce((total, item) => {
    const repetitions = Object.values(item.dailySpots || {})
      .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
    const multiplier = item.adType === 'Spot' ? (item.seconds || 0) : 1;
    return total + ((item.unitRate || 0) * repetitions * multiplier);
  }, 0);
  const srlAdjustment = Number(order.adjustmentSrl) || 0;

  const sasGross = (order.sasItems || []).reduce((total, item) => {
    const itemTotal = item.format === 'Banner'
      ? (item.cpm || 0) * (item.unitRate || 0)
      : (item.unitRate || 0);
    return total + itemTotal;
  }, 0);
  const sasAdjustment = Number(order.adjustmentSas) || 0;

  return {
    srl: {
      gross: srlGross,
      adjustment: srlAdjustment,
      net: srlGross - srlAdjustment,
    },
    sas: {
      gross: sasGross,
      adjustment: sasAdjustment,
      net: sasGross - sasAdjustment,
    },
  };
};
