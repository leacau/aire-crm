import type { ServerUser } from '@/lib/server/auth';
import type { MobileSession } from '@/lib/server/mobile-auth';
import { listClientActivitiesServer } from '@/lib/server/client-activities';
import { listClientsServer } from '@/lib/server/clients';

export async function buildMobileBootstrapServer(session: MobileSession, requester: ServerUser) {
  const [activities, clients] = await Promise.all([
    listClientActivitiesServer(true, requester),
    listClientsServer(requester),
  ]);
  const tasks = activities.filter(activity => activity.isTask && !activity.completed);

  return {
    session,
    tasks,
    clients,
    stats: {
      pendingTasks: tasks.length,
      visibleClients: clients.length,
    },
  };
}
