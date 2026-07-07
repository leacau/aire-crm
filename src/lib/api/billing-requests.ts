'use client';

import { apiRequest } from '@/lib/api-client';
import type { BillingRequest } from '@/lib/types';

export async function getBillingRequestsByOrder(orderId: string): Promise<BillingRequest[]> {
  const result = await apiRequest<{ billingRequests: BillingRequest[] }>(
    `/api/billing-requests/order/${encodeURIComponent(orderId)}`,
    { method: 'GET' },
  );
  return result.billingRequests;
}
