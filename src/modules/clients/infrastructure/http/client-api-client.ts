'use client';

import { ApiClientError, apiReadWithFallback, apiRequest } from '@/core/http/api-client';
import type {
  Client,
  CreateClientInput,
  CreatePersonInput,
  Person,
  UpdateClientInput,
  UpdatePersonInput,
} from '../../domain/client';

const API_PATH = '/api/v1/clients';
const CACHE_DURATION_MS = 5 * 60 * 1000;
let clientCache: { data: Client[]; expiresAt: number } | null = null;
const personClientIndex = new Map<string, string>();

function invalidateClients() {
  clientCache = null;
}

export async function getClients(options: { forceServer?: boolean } = {}): Promise<Client[]> {
  if (!options.forceServer && clientCache && clientCache.expiresAt > Date.now()) return clientCache.data;
  const clients = await apiReadWithFallback<Client[]>(
    API_PATH,
    async () => {
    const { getClients: getClientsFromFirestore } = await import('@/lib/firebase-service');
      return getClientsFromFirestore({ forceServer: options.forceServer }) as Promise<Client[]>;
    },
    { label: 'clients' },
  );
  clientCache = { data: clients, expiresAt: Date.now() + CACHE_DURATION_MS };
  return clients;
}

export async function getClient(id: string): Promise<Client | null> {
  try {
    return await apiRequest<Client>(`${API_PATH}/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function createClient(
  input: CreateClientInput,
  ownerId?: string,
  ownerName?: string,
  options: { skipCoachingUpdate?: boolean } = {},
): Promise<string> {
  const result = await apiRequest<{ id: string }>(API_PATH, {
    method: 'POST',
    body: JSON.stringify({ ...input, ownerId, ownerName }),
  });
  invalidateClients();

  if (ownerId && ownerName && !options.skipCoachingUpdate) {
    try {
      const { autoUpdateCoachingSession } = await import('@/lib/firebase-service');
      await autoUpdateCoachingSession(
        ownerId,
        ownerName,
        'client',
        result.id,
        input.denominacion,
        'Nuevo cliente cargado en el sistema.',
      );
    } catch (error) {
      console.error('No se pudo actualizar el seguimiento del cliente:', error);
    }
  }
  return result.id;
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  _userId: string,
  _userName: string,
): Promise<void> {
  await apiRequest(`${API_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  invalidateClients();
}

export async function getPeopleByClientId(clientId: string): Promise<Person[]> {
  const people = await apiRequest<Person[]>(`${API_PATH}/${encodeURIComponent(clientId)}/people`);
  people.forEach(person => personClientIndex.set(person.id, clientId));
  return people;
}

export async function createPerson(
  input: CreatePersonInput,
  _userId: string,
  _userName: string,
): Promise<string> {
  const clientId = input.clientIds[0];
  if (!clientId) throw new Error('El contacto debe estar asociado a un cliente.');
  const { clientIds: _clientIds, ...body } = input;
  const result = await apiRequest<{ id: string }>(`${API_PATH}/${encodeURIComponent(clientId)}/people`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  personClientIndex.set(result.id, clientId);
  invalidateClients();
  return result.id;
}

export async function updatePerson(
  id: string,
  input: UpdatePersonInput,
  _userId: string,
  _userName: string,
): Promise<void> {
  const clientId = personClientIndex.get(id);
  if (!clientId) throw new Error('No se pudo determinar el cliente del contacto.');
  await apiRequest(`${API_PATH}/${encodeURIComponent(clientId)}/people/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deletePerson(
  id: string,
  _userId: string,
  _userName: string,
): Promise<void> {
  const clientId = personClientIndex.get(id);
  if (!clientId) throw new Error('No se pudo determinar el cliente del contacto.');
  await apiRequest<void>(`${API_PATH}/${encodeURIComponent(clientId)}/people/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  personClientIndex.delete(id);
  invalidateClients();
}
