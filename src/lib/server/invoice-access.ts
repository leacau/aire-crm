import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import type { Client, Invoice, Opportunity } from '@/lib/types';

type InvoiceAccessCache = {
  opportunitiesById: Map<string, Opportunity | null>;
  clientsById: Map<string, Client | null>;
};

function createInvoiceAccessCache(): InvoiceAccessCache {
  return {
    opportunitiesById: new Map(),
    clientsById: new Map(),
  };
}

async function getOpportunityForInvoiceAccess(
  opportunityId: string,
  cache: InvoiceAccessCache,
): Promise<Opportunity | null> {
  if (cache.opportunitiesById.has(opportunityId)) {
    return cache.opportunitiesById.get(opportunityId) || null;
  }

  const opportunitySnap = await dbAdmin.collection('opportunities').doc(opportunityId).get();
  const opportunity = opportunitySnap.exists
    ? { id: opportunitySnap.id, ...opportunitySnap.data() } as Opportunity
    : null;
  cache.opportunitiesById.set(opportunityId, opportunity);
  return opportunity;
}

async function getClientForInvoiceAccess(
  clientId: string,
  cache: InvoiceAccessCache,
): Promise<Client | null> {
  if (cache.clientsById.has(clientId)) {
    return cache.clientsById.get(clientId) || null;
  }

  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  const client = clientSnap.exists
    ? { id: clientSnap.id, ...clientSnap.data() } as Client
    : null;
  cache.clientsById.set(clientId, client);
  return client;
}

export async function canAccessInvoiceRead(
  invoice: Invoice,
  requester: ServerUser,
  cache: InvoiceAccessCache = createInvoiceAccessCache(),
): Promise<boolean> {
  if (hasServerManagementPrivileges(requester)) return true;
  if (invoice.opportunityId === 'manual') {
    return hasServerScreenPermission(requester, 'Carpeta', 'view');
  }
  if (!invoice.opportunityId) return false;

  const opportunity = await getOpportunityForInvoiceAccess(invoice.opportunityId, cache);
  if (!opportunity) return false;
  if (opportunity.ownerId === requester.uid) return true;
  if (!opportunity.clientId) return false;

  const client = await getClientForInvoiceAccess(opportunity.clientId, cache);
  return client?.ownerId === requester.uid;
}

export async function filterAccessibleInvoices(
  invoices: Invoice[],
  requester: ServerUser,
): Promise<Invoice[]> {
  if (hasServerManagementPrivileges(requester)) return invoices;

  const cache = createInvoiceAccessCache();
  const accessResults = await Promise.all(
    invoices.map(invoice => canAccessInvoiceRead(invoice, requester, cache)),
  );
  return invoices.filter((_, index) => accessResults[index]);
}

export async function canAccessInvoiceMutationByOpportunity(
  opportunityId: string | undefined,
  requester: ServerUser,
): Promise<boolean> {
  if (hasServerManagementPrivileges(requester)) return true;
  if (opportunityId === 'manual') {
    return hasServerScreenPermission(requester, 'Carpeta', 'edit');
  }
  if (!opportunityId) return false;

  const opportunitySnap = await dbAdmin.collection('opportunities').doc(opportunityId).get();
  if (!opportunitySnap.exists) return false;

  const opportunity = opportunitySnap.data() as Opportunity;
  if (!opportunity.clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(opportunity.clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

export async function canAccessInvoiceMutation(
  invoice: Invoice,
  requester: ServerUser,
): Promise<boolean> {
  return canAccessInvoiceMutationByOpportunity(invoice.opportunityId, requester);
}
