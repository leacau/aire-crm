import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import type { Invoice, Opportunity } from '@/lib/types';

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
