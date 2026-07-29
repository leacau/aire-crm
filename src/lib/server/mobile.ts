import type { ServerUser } from '@/lib/server/auth';
import type { MobileSession } from '@/lib/server/mobile-auth';
import { listClientActivitiesServer } from '@/lib/server/client-activities';
import { listClientsServer } from '@/lib/server/clients';
import { listOpportunitiesServer } from '@/lib/server/opportunities';

export async function buildMobileBootstrapServer(session: MobileSession, requester: ServerUser) {
  const [activities, clients, opportunities] = await Promise.all([
    listClientActivitiesServer(true, requester),
    listClientsServer(requester),
    listOpportunitiesServer('active', null, requester),
  ]);
  const tasks = activities.filter(activity => activity.isTask && !activity.completed);

  return {
    session,
    tasks,
    clients,
    opportunities,
    stats: {
      pendingTasks: tasks.length,
      visibleClients: clients.length,
      activeOpportunities: opportunities.length,
    },
  };
}
