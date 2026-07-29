import type { User } from 'firebase/auth';
import { apiRequest } from './api-client';
import type {
  AuthSession,
  Client,
  ClientActivity,
  CreateClientActivityInput,
  MobileBootstrap,
  MobileClientDetail,
  Opportunity,
} from './types';

export function validateSession(user: User) {
  return apiRequest<AuthSession>('/api/auth/session', {
    method: 'POST',
    user,
  });
}

function isMobileBootstrap(value: unknown): value is MobileBootstrap {
  return Boolean(
    value
    && typeof value === 'object'
    && 'session' in value
    && (value as { session?: unknown }).session
    && typeof (value as { session?: unknown }).session === 'object',
  );
}

export async function getMobileBootstrap(user: User) {
  const bootstrap = await apiRequest<MobileBootstrap>('/api/mobile/bootstrap', {
    method: 'GET',
    user,
  });

  if (!isMobileBootstrap(bootstrap)) {
    throw new Error('La API mobile devolvio un inicio invalido.');
  }

  return bootstrap;
}

export function getTasks(user: User) {
  return apiRequest<{ activities: ClientActivity[] }>('/api/mobile/tasks', {
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
  return apiRequest<{ clients: Client[] }>('/api/mobile/clients', {
    method: 'GET',
    user,
  });
}

export function getClientDetail(user: User, clientId: string) {
  return apiRequest<MobileClientDetail>(`/api/mobile/clients/${encodeURIComponent(clientId)}`, {
    method: 'GET',
    user,
  });
}

export function createClientActivity(user: User, activityData: CreateClientActivityInput) {
  return apiRequest<{ id: string }>('/api/client-activities', {
    method: 'POST',
    user,
    body: { activityData },
  });
}

export function getOpportunities(user: User) {
  return apiRequest<{ opportunities: Opportunity[] }>('/api/mobile/opportunities', {
    method: 'GET',
    user,
  });
}
