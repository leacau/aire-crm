'use client';

import { apiRequest } from '@/lib/api-client';
import type { CoachingSession, Opportunity, PaymentEntry, User } from '@/lib/types';

export type AdvisorReportData = {
  advisor: User;
  opportunities: Opportunity[];
  payments: PaymentEntry[];
  coaching: CoachingSession | null;
};

export async function getReportDataForAdvisors(advisorIds: string[]): Promise<AdvisorReportData[]> {
  const result = await apiRequest<{ reports: AdvisorReportData[] }>('/api/reports/advisors', {
    method: 'POST',
    body: { advisorIds },
  });
  return result.reports;
}
