export { clientActivityTypes } from './domain/task';
export type { ClientActivity, ClientActivityType } from './domain/task';
export { completeTask, getMyOpenTasks, rescheduleTask } from './infrastructure/http/task-api-client';
