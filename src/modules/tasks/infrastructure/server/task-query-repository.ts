import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { dbAdmin } from '@/lib/firebase-admin';
import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { ApiError } from '@/lib/server/api-error';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import { listClientIdsForOrganization } from '@/modules/clients/server-index';
import type { RescheduleTaskRequest } from '../../application/task-schemas';
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

export async function listOpenTasksForUser(
  organizationId: string,
  userId: string,
): Promise<ClientActivity[]> {
  const clientIds = await listClientIdsForOrganization(organizationId);
  const snapshot = await taskCollection.where('userId', '==', userId).get();

  return snapshot.docs
    .map(document => ({ document, data: document.data() }))
    .filter(({ data }) => {
      if (data.organizationId) return data.organizationId === organizationId;
      if (data.clientId) return clientIds.has(data.clientId);
      return organizationId === DEFAULT_ORGANIZATION_ID;
    })
    .map(({ document, data }) => ({
      ...data,
      id: document.id,
      timestamp: timestampToIso(data.timestamp) || new Date(0).toISOString(),
      dueDate: timestampToIso(data.dueDate),
      completedAt: timestampToIso(data.completedAt),
    } as ClientActivity))
    .filter(activity => activity.isTask && !activity.completed)
    .sort((left, right) => Date.parse(left.dueDate || '') - Date.parse(right.dueDate || ''));
}

function belongsToOrganization(
  data: FirebaseFirestore.DocumentData,
  organizationId: string,
  clientIds: Set<string>,
): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  if (data.clientId) return clientIds.has(data.clientId);
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

async function getTaskSnapshotForUser(id: string, user: ServerUser) {
  const [snapshot, clientIds] = await Promise.all([
    taskCollection.doc(id).get(),
    listClientIdsForOrganization(user.organizationId),
  ]);
  const data = snapshot.data() || {};
  if (!snapshot.exists || !belongsToOrganization(data, user.organizationId, clientIds) || !data.isTask) {
    throw new ApiError(404, 'La tarea no existe.', 'TASK_NOT_FOUND');
  }

  if (data.userId !== user.uid && !hasServerManagementPrivileges(user)) {
    throw new ApiError(403, 'Solo el responsable puede modificar esta tarea.', 'TASK_FORBIDDEN');
  }

  return snapshot;
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
