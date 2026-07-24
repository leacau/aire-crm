import type { User } from 'firebase/auth';
import { apiRequest } from './api-client';
import type { AuthSession, Client, ClientActivity } from './types';

export function validateSession(user: User) {
  return apiRequest<AuthSession>('/api/auth/session', {
    method: 'POST',
    user,
  });
}

export function getTasks(user: User) {
  return apiRequest<{ activities: ClientActivity[] }>('/api/client-activities?tasks=true', {
    method: 'GET',
    user,
  });
}

export function completeTask(user: User, taskId: string) {
  return apiRequest<{ ok: true }>(`/api/client-activities/${encodeURIComponent(taskId)}/complete`, {
    method: 'POST',
    user,
  });
}

export function getClients(user: User) {
  return apiRequest<{ clients: Client[] }>('/api/clients', {
    method: 'GET',
    user,
  });
}
