import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { Client } from '@/lib/types';

export async function getAccessibleClient(clientId: string, requester: ServerUser): Promise<Client | null> {
  if (!clientId) return null;

  const snap = await dbAdmin.collection('clients').doc(clientId).get();
  if (!snap.exists) return null;

  const client = serializeDocument<Client>(snap.id, snap.data());
  if (hasServerManagementPrivileges(requester) || client.ownerId === requester.uid) {
    return client;
  }

  return null;
}
