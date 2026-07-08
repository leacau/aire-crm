'use client';

import { apiRequest } from '@/lib/api-client';
import type { VacationRequest, VacationRequestStatus } from '@/lib/types';

export type VacationEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

export async function getVacationRequests(): Promise<VacationRequest[]> {
  const result = await apiRequest<{ requests: VacationRequest[] }>('/api/vacation-requests', {
    method: 'GET',
  });
  return result.requests;
}

export async function createVacationRequest(
  requestData: Omit<VacationRequest, 'id' | 'status'>,
  managerEmail: string | null,
): Promise<{ docId: string; emailPayload: VacationEmailPayload | null }> {
  return apiRequest<{ docId: string; emailPayload: VacationEmailPayload | null }>(
    '/api/vacation-requests',
    {
      method: 'POST',
      body: { requestData, managerEmail },
    },
  );
}

export async function updateVacationRequest(
  requestId: string,
  updates: Partial<VacationRequest>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/vacation-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: { updates },
  });
}

export async function approveVacationRequest(
  requestId: string,
  newStatus: VacationRequestStatus,
  approverId: string,
  applicantEmail: string | null,
): Promise<{ emailPayload: VacationEmailPayload | null }> {
  return apiRequest<{ emailPayload: VacationEmailPayload | null }>(
    `/api/vacation-requests/${encodeURIComponent(requestId)}/status`,
    {
      method: 'PATCH',
      body: { newStatus, approverId, applicantEmail },
    },
  );
}

export async function annulVacationRequest(
  requestId: string,
  reason: string,
  managerId: string,
  managerName: string,
  applicantEmail: string | null,
): Promise<{ emailPayload: VacationEmailPayload | null }> {
  return apiRequest<{ emailPayload: VacationEmailPayload | null }>(
    `/api/vacation-requests/${encodeURIComponent(requestId)}/annul`,
    {
      method: 'POST',
      body: { reason, managerId, managerName, applicantEmail },
    },
  );
}

export async function deleteVacationRequest(requestId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/vacation-requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
  });
}

export async function adjustVacationDays(
  userId: string,
  days: number,
  updatedBy: string,
  updatedByName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/users/${encodeURIComponent(userId)}/vacation-days`, {
    method: 'POST',
    body: { days, updatedBy, updatedByName },
  });
}

export async function addVacationDays(
  userId: string,
  daysToAdd: number,
  updatedBy: string,
  updatedByName: string,
): Promise<void> {
  await adjustVacationDays(userId, daysToAdd, updatedBy, updatedByName);
}
