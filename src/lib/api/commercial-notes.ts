'use client';

import { apiRequest } from '@/lib/api-client';

export async function deleteCommercialNote(noteId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}
