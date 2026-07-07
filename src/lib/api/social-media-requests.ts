'use client';

import { apiRequest } from '@/lib/api-client';

export async function deleteSocialMediaRequest(requestId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/social-media-requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
  });
}
