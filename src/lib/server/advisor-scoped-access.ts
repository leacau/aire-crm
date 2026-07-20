import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';

export type AdvisorScopedRecord = {
  advisorId?: string;
  advisorName?: string;
  clientId?: string;
};

export function canReviewAdvisorScopedRecords(user: ServerUser): boolean {
  return hasServerManagementPrivileges(user) || user.area === 'Pautado';
}

export function canAssignAdvisorScopedOwner(requester: ServerUser): boolean {
  return hasServerManagementPrivileges(requester);
}

async function getOwnedClientIds(userId: string): Promise<Set<string>> {
  const snapshot = await dbAdmin.collection('clients').where('ownerId', '==', userId).get();
  return new Set(snapshot.docs.map(doc => doc.id));
}

export async function canAccessAdvisorScopedRecord(
  record: AdvisorScopedRecord,
  requester: ServerUser,
): Promise<boolean> {
  if (canReviewAdvisorScopedRecords(requester)) return true;
  if (record.advisorId === requester.uid) return true;
  if (!record.clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(record.clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

export async function filterAccessibleAdvisorScopedRecords<T extends AdvisorScopedRecord>(
  records: T[],
  requester: ServerUser,
): Promise<T[]> {
  if (canReviewAdvisorScopedRecords(requester)) return records;

  const ownedClientIds = await getOwnedClientIds(requester.uid);
  return records.filter(record => record.advisorId === requester.uid || Boolean(record.clientId && ownedClientIds.has(record.clientId)));
}

export function changesAdvisorScopedOwner(
  incoming: AdvisorScopedRecord,
  original: AdvisorScopedRecord,
): boolean {
  return (
    (incoming.advisorId !== undefined && incoming.advisorId !== original.advisorId) ||
    (incoming.advisorName !== undefined && incoming.advisorName !== original.advisorName)
  );
}
