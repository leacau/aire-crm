import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ServerUser } from '@/lib/server/auth';
import type { Client, Person } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

export class PeopleApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


async function getClient(clientId: string): Promise<Client | null> {
  const clientSnap = await dbAdmin.collection('clients').doc(clientId).get();
  return clientSnap.exists ? serializeDocument<Client>(clientSnap.id, clientSnap.data()) : null;
}

async function getFirstClient(clientIds?: string[]): Promise<Client | null> {
  const clientId = clientIds?.[0];
  return clientId ? getClient(clientId) : null;
}

function normalizeClientIds(clientIds: unknown): string[] {
  return Array.isArray(clientIds)
    ? Array.from(new Set(clientIds.map(clientId => String(clientId).trim()).filter(Boolean)))
    : [];
}

async function requireClientIdsAccess(clientIds: string[], requester: ServerUser) {
  if (clientIds.length === 0) {
    throw new PeopleApiError('El contacto debe estar asociado a un cliente.', 400);
  }

  if (hasServerManagementPrivileges(requester)) return;

  for (const clientId of clientIds) {
    const client = await getClient(clientId);
    if (!client || client.ownerId !== requester.uid) {
      throw new PeopleApiError('Forbidden', 403);
    }
  }
}

export async function createPersonServer(
  personData: Omit<Person, 'id'> | undefined,
  requester: ServerUser,
): Promise<string> {
  const name = personData?.name?.trim();
  const clientIds = normalizeClientIds(personData?.clientIds);

  if (!name) {
    throw new PeopleApiError('El nombre del contacto es obligatorio.', 400);
  }

  await requireClientIdsAccess(clientIds, requester);

  const docRef = await dbAdmin.collection('people').add({
    ...personData,
    name,
    clientIds,
    createdAt: FieldValue.serverTimestamp(),
  });

  const requesterName = getRequesterName(requester);
  for (const clientId of personData?.clientIds || []) {
    const clientRef = dbAdmin.collection('clients').doc(clientId);
    const clientData = await getClient(clientId);
    if (!clientData) continue;

    await clientRef.update({ personIds: FieldValue.arrayUnion(docRef.id) });
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'person',
      entityId: docRef.id,
      entityName: name,
      details: `creo el contacto <strong>${name}</strong> para el cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
      ownerName: clientData.ownerName,
    });
  }

  return docRef.id;
}

export async function updatePersonServer(
  personId: string,
  data: Partial<Omit<Person, 'id'>>,
  requester: ServerUser,
): Promise<void> {
  const personRef = dbAdmin.collection('people').doc(personId);
  const originalDoc = await personRef.get();

  if (!originalDoc.exists) {
    throw new PeopleApiError('Person not found', 404);
  }

  const originalData = { id: originalDoc.id, ...originalDoc.data() } as Person;
  const nextClientIds = data.clientIds !== undefined
    ? normalizeClientIds(data.clientIds)
    : normalizeClientIds(originalData.clientIds);
  await requireClientIdsAccess(
    Array.from(new Set([...normalizeClientIds(originalData.clientIds), ...nextClientIds])),
    requester,
  );

  await personRef.update({
    ...data,
    ...(data.clientIds !== undefined ? { clientIds: nextClientIds } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const clientData = await getFirstClient(originalData.clientIds);
  if (clientData) {
    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'person',
      entityId: personId,
      entityName: data.name || originalData.name,
      details: `actualizo el contacto <strong>${data.name || originalData.name}</strong>`,
      ownerName: clientData.ownerName,
    });
  }
}

export async function deletePersonServer(personId: string, requester: ServerUser): Promise<void> {
  const personRef = dbAdmin.collection('people').doc(personId);
  const personSnap = await personRef.get();

  if (!personSnap.exists) {
    throw new PeopleApiError('Person not found', 404);
  }

  const personData = { id: personSnap.id, ...personSnap.data() } as Person;
  await requireClientIdsAccess(normalizeClientIds(personData.clientIds), requester);

  await personRef.delete();

  const clientId = personData.clientIds?.[0];
  const clientData = await getFirstClient(personData.clientIds);
  if (clientData && clientId) {
    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'person',
      entityId: personId,
      entityName: personData.name,
      details: `elimino el contacto <strong>${personData.name}</strong> del cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientData.denominacion}</a>`,
      ownerName: clientData.ownerName,
    });
  }
}
