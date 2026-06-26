'use client';

import { apiRequest } from '@/core/http/api-client';
import type {
  BillingRequestTransitionInput,
  BillingRequestWithMetadata,
} from '../../domain/billing-request';

const API_PATH = '/api/v1/billing/requests';

export function getBillingRequestContext(): Promise<{ isBillingReceptor: boolean }> {
  return apiRequest<{ isBillingReceptor: boolean }>('/api/v1/billing/request-context');
}

export function getBillingRequests(): Promise<BillingRequestWithMetadata[]> {
  return apiRequest<BillingRequestWithMetadata[]>(API_PATH);
}

export function transitionBillingRequest(
  id: string,
  input: BillingRequestTransitionInput,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`${API_PATH}/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
