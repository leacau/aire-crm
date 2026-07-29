import { listClientActivitiesServer } from '@/lib/server/client-activities';
import { listClientsServer } from '@/lib/server/clients';
import { listInvoicesServer } from '@/lib/server/invoices';
import { listOpportunitiesServer } from '@/lib/server/opportunities';
import { listPaymentsServer } from '@/lib/server/payments';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { listUsersServer } from '@/lib/server/users';

export async function getDashboardBootstrapServer(requester: ServerUser, includeHeavy: boolean) {
  const [users, clients, tasks] = await Promise.all([
    listUsersServer(null, requester),
    listClientsServer(requester),
    listClientActivitiesServer(true, requester),
  ]);

  const base = {
    users,
    clients,
    tasks,
    opportunities: [],
    invoices: [],
    paymentEntries: [],
  };

  if (!includeHeavy) return base;

  const [opportunities, invoices, paymentEntries] = await Promise.all([
    listOpportunitiesServer('active', null, requester),
    listInvoicesServer({ dashboard: true, requester }),
    listPaymentsServer({ pending: true, requester }),
  ]);

  return {
    ...base,
    opportunities,
    invoices,
    paymentEntries: hasServerManagementPrivileges(requester)
      ? paymentEntries
      : paymentEntries.filter(payment => payment.advisorId === requester.uid),
  };
}
