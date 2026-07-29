import type { User } from 'firebase/auth';
import { apiRequest } from './api-client';
import type {
  AuthSession,
  BillingBootstrap,
  Client,
  ClientActivity,
  CreateClientActivityInput,
  MobileBootstrap,
  MobileClientDetail,
  MobileOpportunityDetail,
  Opportunity,
  PaymentEntry,
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

export function rescheduleTask(user: User, taskId: string, dueDate: string) {
  return apiRequest<{ ok: true }>(`/api/client-activities/${encodeURIComponent(taskId)}/reschedule`, {
    method: 'POST',
    user,
    body: { dueDate },
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

export function getOpportunityDetail(user: User, opportunityId: string) {
  return apiRequest<MobileOpportunityDetail>(`/api/mobile/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'GET',
    user,
  });
}

export function getBillingBootstrap(user: User) {
  return apiRequest<BillingBootstrap>('/api/billing/bootstrap', {
    method: 'GET',
    user,
  });
}

export function updatePaymentEntry(
  user: User,
  paymentId: string,
  updates: Partial<Pick<PaymentEntry, 'status' | 'notes' | 'nextContactAt' | 'pendingAmount'>>,
) {
  return apiRequest<{ ok: true }>(`/api/payments/${encodeURIComponent(paymentId)}`, {
    method: 'PATCH',
    user,
    body: {
      updates,
      audit: {
        details: 'Actualizo un registro de mora desde mobile',
      },
    },
  });
}
