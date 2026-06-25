import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { dbAdmin } from '@/lib/firebase-admin';
import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { ApiError } from '@/lib/server/api-error';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import { listClientIdsForOrganization } from '@/modules/clients/server-index';
import { listProspectIdsForOrganization } from '@/modules/prospects/server-index';
import type {
  CreateActivityRequest,
  RescheduleTaskRequest,
  UpdateActivityRequest,
} from '../../application/task-schemas';
import type { ClientActivity } from '../../domain/task';

const taskCollection = dbAdmin.collection('client-activities');

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
  }
  return undefined;
}

function serializeActivity(id: string, data: FirebaseFirestore.DocumentData): ClientActivity {
  return {
    ...data,
    id,
    timestamp: timestampToIso(data.timestamp) || new Date(0).toISOString(),
    dueDate: timestampToIso(data.dueDate),
    completedAt: timestampToIso(data.completedAt),
  } as ClientActivity;
}

export async function listOpenTasksForUser(
  organizationId: string,
  userId: string,
): Promise<ClientActivity[]> {
  const [clientIds, prospectIds] = await Promise.all([
    listClientIdsForOrganization(organizationId),
    listProspectIdsForOrganization(organizationId),
  ]);
  const snapshot = await taskCollection.where('userId', '==', userId).get();

  return snapshot.docs
    .map(document => ({ document, data: document.data() }))
    .filter(({ data }) => belongsToOrganization(data, organizationId, clientIds, prospectIds))
    .map(({ document, data }) => serializeActivity(document.id, data))
    .filter(activity => activity.isTask && !activity.completed)
    .sort((left, right) => Date.parse(left.dueDate || '') - Date.parse(right.dueDate || ''));
}

function belongsToOrganization(
  data: FirebaseFirestore.DocumentData,
  organizationId: string,
  clientIds: Set<string>,
  prospectIds: Set<string>,
): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  if (data.clientId) return clientIds.has(data.clientId);
  if (data.prospectId) return prospectIds.has(data.prospectId);
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

async function getActivitySnapshotForUser(id: string, user: ServerUser) {
  const [snapshot, clientIds, prospectIds] = await Promise.all([
    taskCollection.doc(id).get(),
    listClientIdsForOrganization(user.organizationId),
    listProspectIdsForOrganization(user.organizationId),
  ]);
  const data = snapshot.data() || {};
  if (!snapshot.exists || !belongsToOrganization(data, user.organizationId, clientIds, prospectIds)) {
    throw new ApiError(404, 'La actividad no existe.', 'ACTIVITY_NOT_FOUND');
  }

  if (data.userId !== user.uid && !hasServerManagementPrivileges(user)) {
    throw new ApiError(403, 'Solo el responsable puede modificar esta actividad.', 'ACTIVITY_FORBIDDEN');
  }

  return snapshot;
}

async function getTaskSnapshotForUser(id: string, user: ServerUser) {
  const snapshot = await getActivitySnapshotForUser(id, user);
  if (!snapshot.data()?.isTask) {
    throw new ApiError(404, 'La tarea no existe.', 'TASK_NOT_FOUND');
  }
  return snapshot;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export async function listActivitiesForOrganization(
  organizationId: string,
  filters: { clientId?: string; prospectId?: string } = {},
): Promise<ClientActivity[]> {
  const [clientIds, prospectIds] = await Promise.all([
    listClientIdsForOrganization(organizationId),
    listProspectIdsForOrganization(organizationId),
  ]);

  if (filters.clientId && !clientIds.has(filters.clientId)) {
    throw new ApiError(404, 'El cliente no existe.', 'CLIENT_NOT_FOUND');
  }
  if (filters.prospectId && !prospectIds.has(filters.prospectId)) {
    throw new ApiError(404, 'El prospecto no existe.', 'PROSPECT_NOT_FOUND');
  }

  let query: FirebaseFirestore.Query = taskCollection;
  if (filters.clientId) query = query.where('clientId', '==', filters.clientId);
  if (filters.prospectId) query = query.where('prospectId', '==', filters.prospectId);

  const snapshot = await query.get();
  return snapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId, clientIds, prospectIds))
    .map(document => serializeActivity(document.id, document.data()))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

export async function createActivityOnServer(
  input: CreateActivityRequest,
  user: ServerUser,
): Promise<string> {
  const [clientIds, prospectIds] = await Promise.all([
    listClientIdsForOrganization(user.organizationId),
    listProspectIdsForOrganization(user.organizationId),
  ]);

  if (input.clientId && !clientIds.has(input.clientId)) {
    throw new ApiError(404, 'El cliente no existe.', 'CLIENT_NOT_FOUND');
  }
  if (input.prospectId && !prospectIds.has(input.prospectId)) {
    throw new ApiError(404, 'El prospecto no existe.', 'PROSPECT_NOT_FOUND');
  }

  const data = removeUndefined({
    ...input,
    organizationId: user.organizationId,
    userId: user.uid,
    userName: user.name,
    completed: input.completed ?? false,
    timestamp: FieldValue.serverTimestamp(),
    dueDate: input.isTask && input.dueDate
      ? Timestamp.fromDate(new Date(input.dueDate))
      : undefined,
  });

  const reference = await taskCollection.add(data);
  return reference.id;
}

export async function updateActivityOnServer(
  id: string,
  input: UpdateActivityRequest,
  user: ServerUser,
): Promise<void> {
  const snapshot = await getActivitySnapshotForUser(id, user);
  const update: Record<string, unknown> = {
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (input.completed === true) {
    update.completedAt = FieldValue.serverTimestamp();
    update.completedByUserId = user.uid;
    update.completedByUserName = user.name;
  } else if (input.completed === false) {
    update.completedAt = FieldValue.delete();
    update.completedByUserId = FieldValue.delete();
    update.completedByUserName = FieldValue.delete();
  }

  if (input.dueDate) {
    update.dueDate = Timestamp.fromDate(new Date(input.dueDate));
  }

  if (input.googleCalendarEventId === null) {
    update.googleCalendarEventId = FieldValue.delete();
  }

  await snapshot.ref.update(update);
}

export async function completeTaskOnServer(id: string, user: ServerUser): Promise<void> {
  const snapshot = await getTaskSnapshotForUser(id, user);
  await snapshot.ref.update({
    completed: true,
    completedAt: FieldValue.serverTimestamp(),
    completedByUserId: user.uid,
    completedByUserName: user.name,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'client_activity',
    entityId: id,
    entityName: 'Tarea completada',
    details: 'marcó la tarea como finalizada',
    ownerName: user.name,
    organizationId: user.organizationId,
  });
}

export async function rescheduleTaskOnServer(
  id: string,
  input: RescheduleTaskRequest,
  user: ServerUser,
): Promise<void> {
  const snapshot = await getTaskSnapshotForUser(id, user);
  await snapshot.ref.update({
    dueDate: Timestamp.fromDate(new Date(input.dueDate)),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
