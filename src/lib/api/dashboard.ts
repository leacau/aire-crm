'use client';

import { apiRequest } from '@/lib/api-client';
import type { Client, ClientActivity, Invoice, Opportunity, PaymentEntry, User } from '@/lib/types';

export type DashboardBootstrap = {
  users: User[];
  clients: Client[];
  tasks: ClientActivity[];
  opportunities: Opportunity[];
  invoices: Invoice[];
  paymentEntries: PaymentEntry[];
};

export async function getDashboardBootstrap(includeHeavy: boolean): Promise<DashboardBootstrap> {
  const params = new URLSearchParams({ includeHeavy: includeHeavy ? 'true' : 'false' });
  return apiRequest<DashboardBootstrap>(`/api/dashboard?${params}`, { method: 'GET' });
}
