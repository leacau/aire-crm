'use client';

import { apiRequest, getApiAuthUser, publicApiRequest } from '@/lib/api-client';
import type { CommercialNote } from '@/lib/types';

async function fetchPublicCommercialNote(noteId: string): Promise<CommercialNote | null> {
  const result = await publicApiRequest<{ note: CommercialNote | null }>(
    `/api/commercial-notes/${encodeURIComponent(noteId)}`,
    { method: 'GET' },
  );
  return result.note;
}

async function getCommercialNotes(params?: Record<string, string>): Promise<CommercialNote[]> {
  const searchParams = params ? new URLSearchParams(params) : null;
  const path = `/api/commercial-notes${searchParams ? `?${searchParams}` : ''}`;
  const result = await apiRequest<{ notes: CommercialNote[] }>(path, { method: 'GET' });
  return result.notes;
}

export async function saveCommercialNote(
  noteData: Omit<CommercialNote, 'id' | 'createdAt'>,
): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/commercial-notes', {
    method: 'POST',
    body: { noteData },
  });
  return result.id;
}

export async function getCommercialNotesByClientId(clientId: string): Promise<CommercialNote[]> {
  return getCommercialNotes({ clientId });
}

export async function getCommercialNotesForAdvisor(advisorId: string): Promise<CommercialNote[]> {
  return getCommercialNotes({ advisorId });
}

export async function getAllCommercialNotes(): Promise<CommercialNote[]> {
  return getCommercialNotes();
}

export async function getCommercialNotesByOrderId(orderId: string): Promise<CommercialNote[]> {
  return getCommercialNotes({ orderId });
}

export async function getCommercialNote(noteId: string): Promise<CommercialNote | null> {
  if (!(await getApiAuthUser())) {
    return fetchPublicCommercialNote(noteId);
  }

  const result = await apiRequest<{ note: CommercialNote | null }>(
    `/api/commercial-notes/${encodeURIComponent(noteId)}`,
    { method: 'GET' },
  );
  return result.note;
}

export async function updateCommercialNote(
  noteId: string,
  noteData: Partial<Omit<CommercialNote, 'id' | 'createdAt'>>,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    body: { noteData },
  });
}

export async function linkCommercialNoteToOrder(
  noteId: string,
  orderId: string,
  orderTitle: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-notes/${encodeURIComponent(noteId)}/order-link`, {
    method: 'PATCH',
    body: { orderId, orderTitle },
  });
}

export async function unlinkCommercialNoteFromOrder(noteId: string, reason: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-notes/${encodeURIComponent(noteId)}/order-link`, {
    method: 'DELETE',
    body: { reason },
  });
}

export async function deleteCommercialNote(noteId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/commercial-notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}
