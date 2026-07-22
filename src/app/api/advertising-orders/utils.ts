import type { AdvertisingOrder } from '@/lib/types';

export { mapAdvertisingOrder } from '@/lib/server/advertising-orders';

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
