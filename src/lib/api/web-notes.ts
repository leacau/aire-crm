'use client';

import { apiRequest } from '@/lib/api-client';
import type { WebNote } from '@/lib/types';

async function getWebNotesFromApi(params?: Record<string, string>): Promise<WebNote[]> {
  const searchParams = params ? new URLSearchParams(params) : null;
  const path = `/api/web-notes${searchParams ? `?${searchParams}` : ''}`;
  const result = await apiRequest<{ notes: WebNote[] }>(path, { method: 'GET' });
  return result.notes;
}

export async function saveWebNote(noteData: Omit<WebNote, 'id' | 'createdAt'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/web-notes', {
    method: 'POST',
    body: { noteData },
  });
  return result.id;
}

export async function getWebNotes(): Promise<WebNote[]> {
  return getWebNotesFromApi();
}

export async function getWebNotesByOrderId(orderId: string): Promise<WebNote[]> {
  return getWebNotesFromApi({ orderId });
}

export async function getWebNotesByClientId(clientId: string): Promise<WebNote[]> {
  return getWebNotesFromApi({ clientId });
}

export async function getWebNote(noteId: string): Promise<WebNote | null> {
  const result = await apiRequest<{ note: WebNote | null }>(`/api/web-notes/${encodeURIComponent(noteId)}`, {
    method: 'GET',
  });
  return result.note;
}

export async function updateWebNote(
  noteId: string,
  data: Partial<Omit<WebNote, 'id' | 'createdAt'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/web-notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function linkWebNoteToOrder(noteId: string, orderId: string, orderTitle: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/web-notes/${encodeURIComponent(noteId)}/order-link`, {
    method: 'PATCH',
    body: { orderId, orderTitle },
  });
}

export async function unlinkWebNoteFromOrder(noteId: string, reason: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/web-notes/${encodeURIComponent(noteId)}/order-link`, {
    method: 'DELETE',
    body: { reason },
  });
}

export async function deleteWebNote(noteId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/web-notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}
