'use client';

import { apiRequest } from '@/lib/api-client';
import type { PipelineInteraction } from '@/lib/types';

export async function getPipelineInteractions(): Promise<PipelineInteraction[]> {
  const result = await apiRequest<{ interactions: PipelineInteraction[] }>('/api/pipeline-interactions', {
    method: 'GET',
  });
  return result.interactions;
}

export async function createPipelineInteraction(
  data: Omit<PipelineInteraction, 'id' | 'createdAt' | 'advisorId' | 'advisorName'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/pipeline-interactions', {
    method: 'POST',
    body: { interaction: data },
  });
  return result.id;
}

export async function bulkCreatePipelineInteractions(
  interactions: Partial<PipelineInteraction>[],
): Promise<PipelineInteraction[]> {
  const result = await apiRequest<{ interactions: PipelineInteraction[] }>('/api/pipeline-interactions', {
    method: 'POST',
    body: { interactions },
  });
  return result.interactions;
}

export async function updatePipelineInteraction(
  id: string,
  data: Partial<PipelineInteraction>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/pipeline-interactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deletePipelineInteraction(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/pipeline-interactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
