'use client';

import { apiRequest } from '@/lib/api-client';
import type { Program } from '@/lib/types';

export async function getPrograms(): Promise<Program[]> {
  const result = await apiRequest<{ programs: Program[] }>('/api/programs', { method: 'GET' });
  return result.programs;
}

export async function getPublicPrograms(): Promise<Program[]> {
  const response = await fetch('/api/public/programs', {
    method: 'GET',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudieron cargar los programas.');
  }

  return payload?.programs || [];
}

export async function getProgram(id: string): Promise<Program | null> {
  const result = await apiRequest<{ program: Program | null }>(`/api/programs/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  return result.program;
}

export async function saveProgram(programData: Omit<Program, 'id'>): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/programs', {
    method: 'POST',
    body: { programData },
  });
  return result.id;
}

export async function updateProgram(programId: string, programData: Partial<Omit<Program, 'id'>>): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/programs/${encodeURIComponent(programId)}`, {
    method: 'PATCH',
    body: { programData },
  });
}

export async function deleteProgram(programId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/programs/${encodeURIComponent(programId)}`, {
    method: 'DELETE',
  });
}
