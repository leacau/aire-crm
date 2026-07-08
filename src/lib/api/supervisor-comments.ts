'use client';

import { apiRequest } from '@/lib/api-client';
import type { SupervisorComment } from '@/lib/types';

export type CreateSupervisorCommentInput = {
  entityType: 'client' | 'opportunity';
  entityId: string;
  entityName: string;
  ownerId: string;
  ownerName: string;
  authorId: string;
  authorName: string;
  message: string;
  recipientId?: string;
  recipientName?: string;
};

export type ReplySupervisorCommentInput = {
  commentId: string;
  authorId: string;
  authorName: string;
  message: string;
  recipientId?: string;
  recipientName?: string;
};

export async function getSupervisorCommentsForEntity(
  entityType: 'client' | 'opportunity',
  entityId: string,
): Promise<SupervisorComment[]> {
  const result = await apiRequest<{ comments: SupervisorComment[] }>(
    `/api/supervisor-comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
    { method: 'GET' },
  );
  return result.comments;
}

export async function getSupervisorCommentThreadsForUser(userId: string): Promise<SupervisorComment[]> {
  const result = await apiRequest<{ comments: SupervisorComment[] }>(
    `/api/supervisor-comments?userId=${encodeURIComponent(userId)}`,
    { method: 'GET' },
  );
  return result.comments;
}

export async function createSupervisorComment(input: CreateSupervisorCommentInput): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/supervisor-comments', {
    method: 'POST',
    body: input,
  });
  return result.id;
}

export async function replyToSupervisorComment(input: ReplySupervisorCommentInput): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/supervisor-comments/${encodeURIComponent(input.commentId)}/reply`, {
    method: 'POST',
    body: input,
  });
}

export async function markSupervisorCommentThreadSeen(commentId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/supervisor-comments/${encodeURIComponent(commentId)}/seen`, {
    method: 'POST',
  });
}

export async function deleteSupervisorCommentThread(commentId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/supervisor-comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
}
