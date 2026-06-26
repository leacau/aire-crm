import { FieldValue } from 'firebase-admin/firestore';

import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/server/api-error';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import { toTitleCase } from '@/lib/utils';
import type {
  CreateClientRequest,
  CreatePersonRequest,
  UpdateClientRequest,
  UpdatePersonRequest,
} from '../../application/client-schemas';
import type { Client, Person } from '../../domain/client';

const clientsCollection = dbAdmin.collection('clients');
const peopleCollection = dbAdmin.collection('people');

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
  }
  return undefined;
}

function belongsToOrganization(data: FirebaseFirestore.DocumentData, organizationId: string): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

function serializeClient(id: string, data: FirebaseFirestore.DocumentData): Client {
  return {
    ...data,
    id,
    denominacion: data.denominacion ? toTitleCase(data.denominacion) : '',
    razonSocial: data.razonSocial ? toTitleCase(data.razonSocial) : '',
    razonSocialTango: data.razonSocialTango ? toTitleCase(data.razonSocialTango) : undefined,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    newClientDate: timestampToIso(data.newClientDate),
    deactivationHistory: Array.isArray(data.deactivationHistory)
      ? data.deactivationHistory.map(timestampToIso).filter(Boolean)
      : [],
  } as Client;
}

function serializePerson(id: string, data: FirebaseFirestore.DocumentData): Person {
  return {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  } as Person;
}

async function getClientSnapshot(id: string, organizationId: string) {
  const snapshot = await clientsCollection.doc(id).get();
  if (!snapshot.exists || !belongsToOrganization(snapshot.data() || {}, organizationId)) {
    throw new ApiError(404, 'El cliente no existe.', 'CLIENT_NOT_FOUND');
  }
  return snapshot;
}

function assertCanModifyClient(user: ServerUser, client: Client): void {
  if (hasServerManagementPrivileges(user) || client.ownerId === user.uid) return;
  throw new ApiError(403, 'Solo el responsable puede modificar este cliente.', 'CLIENT_FORBIDDEN');
}

function assertOwnershipChangeAllowed(user: ServerUser, input: UpdateClientRequest): void {
  if (hasServerManagementPrivileges(user)) return;
  if ('ownerId' in input || 'ownerName' in input || 'personIds' in input) {
    throw new ApiError(403, 'Solo un responsable de gestión puede reasignar clientes.', 'CLIENT_ASSIGNMENT_FORBIDDEN');
  }
}

export async function listClientsForOrganization(organizationId: string): Promise<Client[]> {
  const snapshot = organizationId === DEFAULT_ORGANIZATION_ID
    ? await clientsCollection.get()
    : await clientsCollection.where('organizationId', '==', organizationId).get();

  return snapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId))
    .map(document => serializeClient(document.id, document.data()))
    .sort((left, right) => left.denominacion.localeCompare(right.denominacion, 'es'));
}

export async function getClientForOrganization(id: string, organizationId: string): Promise<Client> {
  const snapshot = await getClientSnapshot(id, organizationId);
  return serializeClient(snapshot.id, snapshot.data() || {});
}

export async function createClientOnServer(
  input: CreateClientRequest,
  user: ServerUser,
): Promise<string> {
  const requestedOwnerId = input.ownerId || user.uid;
  const requestedOwnerName = input.ownerName || user.name;
  if (requestedOwnerId !== user.uid && !hasServerManagementPrivileges(user)) {
    throw new ApiError(403, 'No puedes crear un cliente para otro responsable.', 'CLIENT_OWNER_FORBIDDEN');
  }

  const { ownerId: _ownerId, ownerName: _ownerName, ...clientData } = input;
  const data = {
    ...clientData,
    denominacion: toTitleCase(input.denominacion),
    razonSocial: input.razonSocial ? toTitleCase(input.razonSocial) : '',
    organizationId: user.organizationId,
    personIds: [],
    ownerId: requestedOwnerId,
    ownerName: requestedOwnerName,
    isDeactivated: false,
    deactivationHistory: [],
    createdAt: FieldValue.serverTimestamp(),
    ...(input.isNewClient ? { newClientDate: FieldValue.serverTimestamp() } : { isNewClient: false }),
  };

  const reference = await clientsCollection.add(data);
  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'create',
    entityType: 'client',
    entityId: reference.id,
    entityName: input.denominacion,
    details: `creó el cliente <strong>${input.denominacion}</strong>`,
    ownerName: requestedOwnerName,
    organizationId: user.organizationId,
  });
  return reference.id;
}

export async function updateClientOnServer(
  id: string,
  input: UpdateClientRequest,
  user: ServerUser,
): Promise<void> {
  const snapshot = await getClientSnapshot(id, user.organizationId);
  const current = serializeClient(snapshot.id, snapshot.data() || {});
  assertCanModifyClient(user, current);
  assertOwnershipChangeAllowed(user, input);

  const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp() };
  if (input.denominacion) update.denominacion = toTitleCase(input.denominacion);
  if (input.razonSocial) update.razonSocial = toTitleCase(input.razonSocial);
  if (input.isDeactivated === true && !current.isDeactivated) {
    update.deactivationHistory = FieldValue.arrayUnion(FieldValue.serverTimestamp());
  }
  if (input.isNewClient === true && !current.isNewClient) {
    update.newClientDate = FieldValue.serverTimestamp();
  }

  await snapshot.ref.update(update);
  const clientName = input.denominacion || current.denominacion;
  const nextOwnerName = input.ownerName || current.ownerName;
  let details = `actualizó el cliente <strong>${clientName}</strong>`;
  if (input.ownerId && input.ownerId !== current.ownerId) {
    details = `reasignó el cliente <strong>${clientName}</strong> a <strong>${nextOwnerName}</strong>`;
  } else if (input.isDeactivated === true && !current.isDeactivated) {
    details = `dio de baja al cliente <strong>${clientName}</strong>`;
  } else if (input.isDeactivated === false && current.isDeactivated) {
    details = `reactivó al cliente <strong>${clientName}</strong>`;
  }

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'client',
    entityId: id,
    entityName: clientName,
    details,
    ownerName: nextOwnerName,
    organizationId: user.organizationId,
  });
}

export async function listPeopleForClient(clientId: string, user: ServerUser): Promise<Person[]> {
  await getClientSnapshot(clientId, user.organizationId);
  const snapshot = await peopleCollection.where('clientIds', 'array-contains', clientId).get();
  return snapshot.docs
    .filter(document => belongsToOrganization(document.data(), user.organizationId))
    .map(document => serializePerson(document.id, document.data()))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export async function createPersonForClient(
  clientId: string,
  input: CreatePersonRequest,
  user: ServerUser,
): Promise<string> {
  const clientSnapshot = await getClientSnapshot(clientId, user.organizationId);
  const client = serializeClient(clientSnapshot.id, clientSnapshot.data() || {});
  assertCanModifyClient(user, client);

  const personReference = peopleCollection.doc();
  const batch = dbAdmin.batch();
  batch.set(personReference, {
    ...input,
    organizationId: user.organizationId,
    clientIds: [clientId],
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(clientSnapshot.ref, { personIds: FieldValue.arrayUnion(personReference.id) });
  await batch.commit();

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'create',
    entityType: 'person',
    entityId: personReference.id,
    entityName: input.name,
    details: `creó el contacto <strong>${input.name}</strong> para <strong>${client.denominacion}</strong>`,
    ownerName: client.ownerName,
    organizationId: user.organizationId,
  });
  return personReference.id;
}

async function getPersonForClient(personId: string, clientId: string, user: ServerUser) {
  const clientSnapshot = await getClientSnapshot(clientId, user.organizationId);
  const client = serializeClient(clientSnapshot.id, clientSnapshot.data() || {});
  assertCanModifyClient(user, client);
  const personSnapshot = await peopleCollection.doc(personId).get();
  const personData = personSnapshot.data() || {};
  if (
    !personSnapshot.exists ||
    !belongsToOrganization(personData, user.organizationId) ||
    !Array.isArray(personData.clientIds) ||
    !personData.clientIds.includes(clientId)
  ) {
    throw new ApiError(404, 'El contacto no existe para este cliente.', 'PERSON_NOT_FOUND');
  }
  return { client, clientSnapshot, person: serializePerson(personSnapshot.id, personData), personSnapshot };
}

export async function updatePersonForClient(
  clientId: string,
  personId: string,
  input: UpdatePersonRequest,
  user: ServerUser,
): Promise<void> {
  const { client, person, personSnapshot } = await getPersonForClient(personId, clientId, user);
  await personSnapshot.ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'person',
    entityId: personId,
    entityName: input.name || person.name,
    details: `actualizó el contacto <strong>${input.name || person.name}</strong>`,
    ownerName: client.ownerName,
    organizationId: user.organizationId,
  });
}

export async function deletePersonForClient(
  clientId: string,
  personId: string,
  user: ServerUser,
): Promise<void> {
  const { client, clientSnapshot, person, personSnapshot } = await getPersonForClient(personId, clientId, user);
  const batch = dbAdmin.batch();
  batch.delete(personSnapshot.ref);
  batch.update(clientSnapshot.ref, { personIds: FieldValue.arrayRemove(personId) });
  await batch.commit();
  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'delete',
    entityType: 'person',
    entityId: personId,
    entityName: person.name,
    details: `eliminó el contacto <strong>${person.name}</strong> de <strong>${client.denominacion}</strong>`,
    ownerName: client.ownerName,
    organizationId: user.organizationId,
  });
}
