'use client';

import { apiReadWithFallback, apiRequest } from '@/core/http/api-client';
import type { CreateProspectInput, Prospect, UpdateProspectInput } from '../../domain/prospect';

const API_PATH = '/api/v1/prospects';
const CACHE_DURATION_MS = 5 * 60 * 1000;

let cache: { data: Prospect[]; expiresAt: number } | null = null;

function invalidateProspectApiCache() {
  cache = null;
}

export async function getProspects(): Promise<Prospect[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  const prospects = await apiReadWithFallback<Prospect[]>(
    API_PATH,
    async () => {
      const { getProspects: getProspectsFromFirestore } = await import('@/lib/firebase-service');
      return getProspectsFromFirestore() as Promise<Prospect[]>;
    },
    { fallbackOnForbidden: true, label: 'prospects' },
  );
  cache = { data: prospects, expiresAt: Date.now() + CACHE_DURATION_MS };
  return prospects;
}

export async function createProspect(
  input: CreateProspectInput,
  userId: string,
  userName: string,
  options: { skipCoachingUpdate?: boolean } = {},
): Promise<string> {
  const result = await apiRequest<{ id: string }>(API_PATH, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  invalidateProspectApiCache();

  // Transitional side effect until Coaching is migrated behind the API.
  if (!options.skipCoachingUpdate) {
    try {
      const { autoUpdateCoachingSession } = await import('@/lib/firebase-service');
      await autoUpdateCoachingSession(
        userId,
        userName,
        'prospect',
        result.id,
        input.companyName,
        'Nuevo prospecto cargado en el sistema.',
      );
    } catch (error) {
      console.error('No se pudo actualizar el seguimiento del prospecto:', error);
    }
  }

  return result.id;
}

export async function updateProspect(
  id: string,
  input: UpdateProspectInput,
  userId: string,
  userName: string,
): Promise<void> {
  const current = cache?.data.find(prospect => prospect.id === id);
  await apiRequest<{ id: string }>(`${API_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  invalidateProspectApiCache();

  const coachingNotes = [
    input.status && input.status !== current?.status ? `Estado: ${input.status}` : null,
    input.notes && input.notes !== current?.notes ? `Notas: ${input.notes}` : null,
  ].filter(Boolean).join(' - ');

  if (coachingNotes) {
    try {
      const { autoUpdateCoachingSession } = await import('@/lib/firebase-service');
      await autoUpdateCoachingSession(
        userId,
        userName,
        'prospect',
        id,
        input.companyName || current?.companyName || 'Prospecto',
        `Actualización de prospecto - ${coachingNotes}`,
      );
    } catch (error) {
      console.error('No se pudo actualizar el seguimiento del prospecto:', error);
    }
  }
}

export async function deleteProspect(
  id: string,
  _userId: string,
  _userName: string,
): Promise<void> {
  await apiRequest<void>(`${API_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateProspectApiCache();
}

export async function claimProspect(
  prospect: Prospect,
  _userId: string,
  _userName: string,
): Promise<void> {
  await apiRequest(`${API_PATH}/${encodeURIComponent(prospect.id)}/claim`, { method: 'POST' });
  invalidateProspectApiCache();
}

export async function approveProspectClaim(
  prospect: Prospect,
  _managerId: string,
  _managerName: string,
): Promise<void> {
  await apiRequest(`${API_PATH}/${encodeURIComponent(prospect.id)}/claim/approve`, { method: 'POST' });
  invalidateProspectApiCache();
}

export async function rejectProspectClaim(
  prospect: Prospect,
  _managerId: string,
  _managerName: string,
): Promise<void> {
  await apiRequest(`${API_PATH}/${encodeURIComponent(prospect.id)}/claim/reject`, { method: 'POST' });
  invalidateProspectApiCache();
}
