'use client';

import { apiRequest } from '@/lib/api-client';
import type { Person } from '@/lib/types';

export async function createPerson(personData: Omit<Person, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/people', {
    method: 'POST',
    body: { personData },
  });
  return result.id;
}

export async function updatePerson(id: string, data: Partial<Omit<Person, 'id'>>): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/people/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { data },
  });
}

export async function deletePerson(id: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/people/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

