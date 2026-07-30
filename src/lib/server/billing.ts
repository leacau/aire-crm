import { listClientsServer } from '@/lib/server/clients';
import { listOpportunitiesServer } from '@/lib/server/opportunities';
import { listPaymentsServer } from '@/lib/server/payments';
import type { ServerUser } from '@/lib/server/auth';
import { listUsersServer } from '@/lib/server/users';

export async function getBillingBootstrapServer(requester: ServerUser) {
  const [opportunities, clients, advisors, payments] = await Promise.all([
    listOpportunitiesServer('all', null, requester),
    listClientsServer(requester),
    listUsersServer('Asesor', requester),
    listPaymentsServer({ requester }),
  ]);

  return {
    opportunities,
    clients,
    advisors,
    payments,
  };
}
