import type { User } from 'firebase/auth';
import { apiRequest } from './api-client';
import type {
  ApprovalItem,
  AuthSession,
  BillingBootstrap,
  Client,
  ClientActivity,
  ClientTangoBillingSummary,
  CreateClientActivityInput,
  MobileBootstrap,
  MobileAdvertisingOrderDetail,
  MobileAdvertisingOrderSummary,
  MobileClientDetail,
  MobileOpportunityDetail,
  Opportunity,
  PaymentEntry,
  Prospect,
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

export function getClientTangoBillingSummary(user: User, clientId: string) {
  return apiRequest<ClientTangoBillingSummary>(`/api/clients/${encodeURIComponent(clientId)}/tango-billing-summary`, {
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

export function createQuickOpportunity(user: User, title: string, client: Pick<Client, 'id' | 'denominacion' | 'razonSocial'>) {
  return apiRequest<{ id: string }>('/api/opportunities', {
    method: 'POST',
    user,
    body: {
      opportunityData: {
        title,
        clientId: client.id,
        clientName: client.denominacion || client.razonSocial || 'Cliente',
        stage: 'Propuesta',
        value: 0,
        closeDate: '',
        createdAt: new Date().toISOString(),
      },
    },
  });
}

export function getOpportunityDetail(user: User, opportunityId: string) {
  return apiRequest<MobileOpportunityDetail>(`/api/mobile/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'GET',
    user,
  });
}

export function updateOpportunity(
  user: User,
  opportunityId: string,
  data: Partial<Pick<Opportunity, 'stage' | 'value' | 'closeDate' | 'followUpCurrent' | 'followUpNext' | 'highCloseProbability'>>,
) {
  return apiRequest<{ ok: true }>(`/api/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: 'PATCH',
    user,
    body: { data },
  });
}

export function getAdvertisingOrders(
  user: User,
  filters: { clientId?: string; opportunityId?: string; status?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.opportunityId) params.set('opportunityId', filters.opportunityId);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);

  const query = params.toString();
  return apiRequest<{ orders: MobileAdvertisingOrderSummary[] }>(
    `/api/mobile/advertising-orders${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      user,
    },
  );
}

export function getAdvertisingOrderDetail(user: User, orderId: string) {
  return apiRequest<{ order: MobileAdvertisingOrderDetail }>(
    `/api/mobile/advertising-orders/${encodeURIComponent(orderId)}`,
    {
      method: 'GET',
      user,
    },
  );
}

export function getBillingBootstrap(user: User) {
  return apiRequest<BillingBootstrap>('/api/billing/bootstrap', {
    method: 'GET',
    user,
  });
}

export function getApprovals(user: User) {
  return apiRequest<{ approvals: ApprovalItem[] }>('/api/approvals', {
    method: 'GET',
    user,
  });
}

export function getProspects(user: User) {
  return apiRequest<{ prospects: Prospect[] }>('/api/prospects', {
    method: 'GET',
    user,
  });
}

export function createProspect(
  user: User,
  prospectData: Pick<Prospect, 'companyName'> & Partial<Pick<Prospect, 'contactName' | 'contactPhone' | 'contactEmail' | 'sector' | 'notes' | 'status'>>,
) {
  return apiRequest<{ id: string }>('/api/prospects', {
    method: 'POST',
    user,
    body: { prospectData },
  });
}

export function updateProspect(
  user: User,
  prospectId: string,
  data: Partial<Pick<Prospect, 'status' | 'sector' | 'notes' | 'contactName' | 'contactPhone' | 'contactEmail'>>,
) {
  return apiRequest<{ ok: true; originalData: Prospect }>(`/api/prospects/${encodeURIComponent(prospectId)}`, {
    method: 'PATCH',
    user,
    body: { data },
  });
}

export function claimProspect(user: User, prospectId: string) {
  return apiRequest<{ ok: true }>(`/api/prospects/${encodeURIComponent(prospectId)}/claim`, {
    method: 'POST',
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
