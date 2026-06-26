import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';

const clientsCollection = dbAdmin.collection('clients');

function belongsToOrganization(data: FirebaseFirestore.DocumentData, organizationId: string): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

export async function listClientIdsForOrganization(organizationId: string): Promise<Set<string>> {
  // 🟢 Aseguramos que organizationId sea un string válido; si por error llega undefined, fallamos limpiamente en vez de un 500 mortal de la base de datos.
  if (!organizationId) {
      return new Set();
  }

  const snapshot = organizationId === DEFAULT_ORGANIZATION_ID
    ? await clientsCollection.select().get()
    : await clientsCollection.where('organizationId', '==', organizationId).select().get();

  return new Set(
    snapshot.docs
      .filter(document => belongsToOrganization(document.data(), organizationId))
      .map(document => document.id),
  );
}
