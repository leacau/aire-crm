'use client';

import { apiRequest } from '@/core/http/api-client';
import type { ClientActivity } from '../../domain/task';

export function getMyOpenTasks(): Promise<ClientActivity[]> {
  return apiRequest<ClientActivity[]>('/api/v1/tasks');
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
