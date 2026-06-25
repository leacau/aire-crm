import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';

const clientsCollection = dbAdmin.collection('clients');

function belongsToOrganization(data: FirebaseFirestore.DocumentData, organizationId: string): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

export async function listClientIdsForOrganization(organizationId: string): Promise<Set<string>> {
  const snapshot = organizationId === DEFAULT_ORGANIZATION_ID
    ? await clientsCollection.select().get()
    : await clientsCollection.where('organizationId', '==', organizationId).select().get();

  return new Set(
    snapshot.docs
      .filter(document => belongsToOrganization(document.data(), organizationId))
      .map(document => document.id),
  );
}
