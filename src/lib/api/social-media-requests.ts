'use client';

import { apiRequest } from '@/lib/api-client';
import type { SocialMediaRequest } from '@/lib/types';

async function getSocialMediaRequestsFromApi(params?: Record<string, string>): Promise<SocialMediaRequest[]> {
  const searchParams = params ? new URLSearchParams(params) : null;
  const path = `/api/social-media-requests${searchParams ? `?${searchParams}` : ''}`;
  const result = await apiRequest<{ requests: SocialMediaRequest[] }>(path, { method: 'GET' });
  return result.requests;
}

export async function saveSocialMediaRequest(
  requestData: Omit<SocialMediaRequest, 'id' | 'createdAt'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/social-media-requests', {
    method: 'POST',
    body: { requestData },
  });
  return result.id;
}

export async function getSocialMediaRequests(): Promise<SocialMediaRequest[]> {
  return getSocialMediaRequestsFromApi();
}

export async function getSocialMediaRequestsByOrderId(orderId: string): Promise<SocialMediaRequest[]> {
  return getSocialMediaRequestsFromApi({ orderId });
}

export async function getSocialMediaRequestsByClientId(clientId: string): Promise<SocialMediaRequest[]> {
  return getSocialMediaRequestsFromApi({ clientId });
}

export async function getSocialMediaRequest(requestId: string): Promise<SocialMediaRequest | null> {
  const result = await apiRequest<{ request: SocialMediaRequest | null }>(
    `/api/social-media-requests/${encodeURIComponent(requestId)}`,
    { method: 'GET' },
  );
  return result.request;
}

export async function updateSocialMediaRequest(
  requestId: string,
  data: Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/social-media-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function linkSocialMediaRequestToOrder(
  requestId: string,
  orderId: string,
  orderTitle: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/social-media-requests/${encodeURIComponent(requestId)}/order-link`, {
    method: 'PATCH',
    body: { orderId, orderTitle },
  });
}

export async function unlinkSocialMediaRequestFromOrder(requestId: string, reason: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/social-media-requests/${encodeURIComponent(requestId)}/order-link`, {
    method: 'DELETE',
    body: { reason },
  });
}

export async function deleteSocialMediaRequest(requestId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/social-media-requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
  });
}
