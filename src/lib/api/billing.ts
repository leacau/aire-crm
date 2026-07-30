'use client';

import { apiRequest } from '@/lib/api-client';
import type { Client, Opportunity, PaymentEntry, User } from '@/lib/types';

export type BillingBootstrap = {
  opportunities: Opportunity[];
  clients: Client[];
  advisors: User[];
  payments: PaymentEntry[];
};

export async function getBillingBootstrap(): Promise<BillingBootstrap> {
  return apiRequest<BillingBootstrap>('/api/billing/bootstrap', { method: 'GET' });
}
