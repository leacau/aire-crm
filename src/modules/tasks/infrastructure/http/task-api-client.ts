'use client';

import { apiReadWithFallback, apiRequest } from '@/core/http/api-client';
import type { ClientActivity } from '../../domain/task';

type CreateClientActivityInput = Omit<ClientActivity, 'id' | 'timestamp'>;
type UpdateClientActivityInput = Partial<Omit<ClientActivity, 'id'>>;

const ACTIVITIES_PATH = '/api/v1/activities';

export function getMyOpenTasks(): Promise<ClientActivity[]> {
  return apiRequest<ClientActivity[]>('/api/v1/tasks');
}

export async function getClientActivities(clientId: string): Promise<ClientActivity[]> {
  const params = new URLSearchParams({ clientId });
  return apiReadWithFallback<ClientActivity[]>(
    `${ACTIVITIES_PATH}?${params}`,
    async () => {
      const { getClientActivities: getClientActivitiesFromFirestore } = await import('@/lib/firebase-service');
      return getClientActivitiesFromFirestore(clientId) as Promise<ClientActivity[]>;
    },
    { circuitKey: ACTIVITIES_PATH, fallbackOnForbidden: true, label: 'client activities' },
  );
}

export async function getProspectActivities(prospectId: string): Promise<ClientActivity[]> {
  const params = new URLSearchParams({ prospectId });
  return apiReadWithFallback<ClientActivity[]>(
    `${ACTIVITIES_PATH}?${params}`,
    async () => {
      const { getAllClientActivities } = await import('@/lib/firebase-service');
      const activities = await getAllClientActivities();
      return activities.filter(activity => activity.prospectId === prospectId) as ClientActivity[];
    },
    { circuitKey: ACTIVITIES_PATH, fallbackOnForbidden: true, label: 'prospect activities' },
  );
}

export async function getAllClientActivities(): Promise<ClientActivity[]> {
  return apiReadWithFallback<ClientActivity[]>(
    ACTIVITIES_PATH,
    async () => {
      const { getAllClientActivities: getAllClientActivitiesFromFirestore } = await import('@/lib/firebase-service');
      return getAllClientActivitiesFromFirestore() as Promise<ClientActivity[]>;
    },
    { fallbackOnForbidden: true, label: 'activities' },
  );
}

export async function createClientActivity(input: CreateClientActivityInput): Promise<string> {
  const response = await apiRequest<{ id: string }>(ACTIVITIES_PATH, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (input.userId && input.userName) {
    try {
      const { autoUpdateCoachingSession } = await import('@/lib/firebase-service');
      const entityType = input.clientId ? 'client' : 'prospect';
      const entityId = input.clientId || input.prospectId || '';
      const entityName = input.clientName || input.prospectName || '';
      if (entityId) {
        await autoUpdateCoachingSession(
          input.userId,
          input.userName,
          entityType,
          entityId,
          entityName,
          `Actividad (${input.type}): ${input.observation}`,
        );
      }
    } catch (error) {
      console.error('Error auto-updating coaching:', error);
    }
  }

  return response.id;
}

export function updateClientActivity(id: string, input: UpdateClientActivityInput): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`${ACTIVITIES_PATH}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function completeTask(id: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/api/v1/tasks/${id}/complete`, {
    method: 'POST',
  });
}

export function rescheduleTask(id: string, dueDate: Date): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/api/v1/tasks/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ dueDate: dueDate.toISOString() }),
  });
}
