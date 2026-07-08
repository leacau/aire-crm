'use client';

import { apiRequest } from '@/lib/api-client';
import type { CoachingFollowUpEntry, CoachingItem, CoachingSession } from '@/lib/types';

export async function getCoachingSessions(advisorId: string): Promise<CoachingSession[]> {
  const result = await apiRequest<{ sessions: CoachingSession[] }>(
    `/api/coaching-sessions?advisorId=${encodeURIComponent(advisorId)}`,
    { method: 'GET' },
  );
  return result.sessions;
}

export async function createCoachingSession(
  sessionData: Omit<CoachingSession, 'id' | 'createdAt' | 'status'>,
  userId: string,
  userName: string,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/coaching-sessions', {
    method: 'POST',
    body: { sessionData, userId, userName },
  });
  return result.id;
}

export async function deleteCoachingSession(
  sessionId: string,
  userId: string,
  userName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/coaching-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    body: { userId, userName },
  });
}

export async function updateCoachingSession(
  sessionId: string,
  data: Partial<CoachingSession>,
  userId: string,
  userName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/coaching-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: { data, userId, userName },
  });
}

export async function updateCoachingItem(
  sessionId: string,
  itemId: string,
  updates: Partial<CoachingItem>,
  userId: string,
  userName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      body: { updates, userId, userName },
    },
  );
}

export async function deleteCoachingItem(sessionId: string, itemId: string): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

export async function addItemsToSession(
  sessionId: string,
  newItems: CoachingItem[],
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items`,
    {
      method: 'POST',
      body: { newItems },
    },
  );
}

export async function appendCoachingFollowUpEntry(
  sessionId: string,
  itemId: string,
  field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
  text: string,
  userId: string,
  userName: string,
): Promise<CoachingFollowUpEntry | null> {
  const result = await apiRequest<{ entry: CoachingFollowUpEntry | null }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}/entries`,
    {
      method: 'POST',
      body: { field, text, userId, userName },
    },
  );
  return result.entry;
}

export async function updateCoachingFollowUpEntry(
  sessionId: string,
  itemId: string,
  field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
  entryId: string,
  text: string,
  userId: string,
  userName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}/entries/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      body: { field, text, userId, userName },
    },
  );
}

export async function deleteCoachingFollowUpEntry(
  sessionId: string,
  itemId: string,
  field: 'followUpDone' | 'followUpCurrent' | 'followUpNext',
  entryId: string,
  userId: string,
  userName: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/api/coaching-sessions/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}/entries/${encodeURIComponent(entryId)}`,
    {
      method: 'DELETE',
      body: { field, userId, userName },
    },
  );
}

export async function autoUpdateCoachingSession(
  advisorId: string,
  advisorName: string,
  entityType: 'client' | 'prospect',
  entityId: string,
  entityName: string,
  actionText: string,
  options?: {
    createIfMissing?: boolean;
    cancelIfActive?: boolean;
    completeIfActive?: boolean;
    updateExistingIfMissing?: boolean;
  },
): Promise<void> {
  await apiRequest<{ ok: true }>('/api/coaching-sessions/auto-update', {
    method: 'POST',
    body: {
      advisorId,
      advisorName,
      entityType,
      entityId,
      entityName,
      actionText,
      options,
    },
  });
}
