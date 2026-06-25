export { clientActivityTypes } from './domain/task';
export type { ClientActivity, ClientActivityType } from './domain/task';
export {
  completeTask,
  createClientActivity,
  getAllClientActivities,
  getClientActivities,
  getMyOpenTasks,
  getProspectActivities,
  rescheduleTask,
  updateClientActivity,
} from './infrastructure/http/task-api-client';
