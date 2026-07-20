import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import type { AdvertisingOrder } from '@/lib/types';

export function canReviewAdvertisingOrders(user: ServerUser): boolean {
  return hasServerManagementPrivileges(user) || user.area === 'Pautado';
}

export async function canAccessAdvertisingOrder(order: AdvertisingOrder, requester: ServerUser): Promise<boolean> {
  if (canReviewAdvertisingOrders(requester)) return true;
  if (order.createdBy === requester.uid) return true;
  if (!order.clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(order.clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

export async function canCreateAdvertisingOrderForClient(clientId: string, requester: ServerUser): Promise<boolean> {
  if (canReviewAdvertisingOrders(requester)) return true;
  if (!clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

export async function filterAccessibleAdvertisingOrders<T extends AdvertisingOrder>(
  orders: T[],
  requester: ServerUser,
): Promise<T[]> {
  if (canReviewAdvertisingOrders(requester)) return orders;

  const clientIds = Array.from(new Set(orders.map(order => order.clientId).filter(Boolean)));
  const ownedClientIds = new Set<string>();

  for (const clientId of clientIds) {
    const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
    if (clientSnap.exists && clientSnap.data()?.ownerId === requester.uid) {
      ownedClientIds.add(clientId);
    }
  }

  return orders.filter(order => order.createdBy === requester.uid || ownedClientIds.has(order.clientId));
}
