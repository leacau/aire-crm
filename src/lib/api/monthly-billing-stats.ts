'use client';

import { apiRequest } from '@/lib/api-client';

export async function updateMonthlyBillingStat(
  monthKey: string,
  amountToAdd: number,
  advisorId: string,
): Promise<void> {
  await apiRequest<{ ok: true }>('/api/monthly-billing-stats', {
    method: 'POST',
    body: { monthKey, amountToAdd, advisorId },
  });
}
