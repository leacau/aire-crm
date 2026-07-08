'use client';

import { apiRequest } from '@/lib/api-client';
import type { ActivityLog } from '@/lib/types';

export async function getActivities(activityLimit = 20): Promise<ActivityLog[]> {
  const result = await apiRequest<{ activities: ActivityLog[] }>(
    `/api/activities?limit=${encodeURIComponent(String(activityLimit))}`,
    { method: 'GET' },
  );
  return result.activities;
}

export async function getPaymentActivities(paymentId: string, activityLimit = 50): Promise<ActivityLog[]> {
  if (!paymentId) return [];

  const result = await apiRequest<{ activities: ActivityLog[] }>(
    `/api/activities?entityType=payment&entityId=${encodeURIComponent(paymentId)}&limit=${encodeURIComponent(String(activityLimit))}`,
    { method: 'GET' },
  );
  return result.activities;
}

export async function getActivitiesForEntity(entityId: string): Promise<ActivityLog[]> {
  if (!entityId) return [];

  const result = await apiRequest<{ activities: ActivityLog[] }>(
    `/api/activities?scope=client-graph&entityId=${encodeURIComponent(entityId)}`,
    { method: 'GET' },
  );
  return result.activities;
}
