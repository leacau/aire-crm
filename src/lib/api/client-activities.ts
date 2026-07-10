'use client';

import { apiRequest } from '@/lib/api-client';
import type { ClientActivity } from '@/lib/types';

export async function getAllClientActivities(): Promise<ClientActivity[]> {
  const result = await apiRequest<{ activities: ClientActivity[] }>('/api/client-activities', {
    method: 'GET',
  });
  return result.activities;
}

export async function getDashboardTasks(): Promise<ClientActivity[]> {
  const result = await apiRequest<{ activities: ClientActivity[] }>('/api/client-activities?tasks=true', {
    method: 'GET',
  });
  return result.activities;
}

export async function createClientActivity(
  activityData: Omit<ClientActivity, 'id' | 'timestamp'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/client-activities', {
    method: 'POST',
    body: { activityData },
  });
  return result.id;
}

export async function updateClientActivity(
  id: string,
  data: Partial<Omit<ClientActivity, 'id'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/client-activities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function completeActivityTask(activityId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/client-activities/${encodeURIComponent(activityId)}/complete`, {
    method: 'POST',
  });
}

export async function rescheduleActivityTask(activityId: string, newDate: Date): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/client-activities/${encodeURIComponent(activityId)}/reschedule`, {
    method: 'POST',
    body: { dueDate: newDate.toISOString() },
  });
}

export async function cleanupOldActivities(): Promise<{ deleted: number }> {
  return apiRequest<{ deleted: number }>('/api/client-activities/cleanup-old', {
    method: 'POST',
  });
}
