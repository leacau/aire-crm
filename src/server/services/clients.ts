import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Client } from '@/lib/types';

import { adminDb } from '../firebase-admin';
import { logActivity } from './activity-log';

const clientsCollection = adminDb.collection('clients');
const opportunitiesCollection = adminDb.collection('opportunities');
const clientActivitiesCollection = adminDb.collection('client-activities');
const peopleCollection = adminDb.collection('people');
const invoicesCollection = adminDb.collection('invoices');

const toIso = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : value;

const toClient = (doc: QueryDocumentSnapshot): Client => {
  const data = doc.data();
  const deactivationHistory = Array.isArray(data.deactivationHistory)
    ? data.deactivationHistory.map(toIso)
    : [];

  return {
    id: doc.id,
    ...data,
    newClientDate: toIso(data.newClientDate),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    deactivationHistory,
  } as Client;
};

export type ClientMutationContext = {
  userId: string;
  userName: string;
};

export type CreateClientInput = Omit<
  Client,
  'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'
> & {
  ownerId?: string;
  ownerName?: string;
};

export type UpdateClientInput = Partial<Omit<Client, 'id'>>;

export async function listClients(): Promise<Client[]> {
  const snapshot = await clientsCollection.orderBy('denominacion').get();
  return snapshot.docs.map(toClient);
}

export async function getClientById(id: string): Promise<Client | null> {
  const doc = await clientsCollection.doc(id).get();
  if (!doc.exists) {
    return null;
  }
  return toClient(doc as FirebaseFirestore.QueryDocumentSnapshot);
}

export async function createClient(
  data: CreateClientInput,
  context?: ClientMutationContext,
): Promise<string> {
  const payload: Record<string, unknown> = {
    ...data,
    personIds: [],
    createdAt: FieldValue.serverTimestamp(),
    isDeactivated: false,
    deactivationHistory: [],
  };

  if (context?.userId && context?.userName) {
    payload.ownerId = context.userId;
    payload.ownerName = context.userName;
  } else if (data.ownerId && data.ownerName) {
    payload.ownerId = data.ownerId;
    payload.ownerName = data.ownerName;
  }

  if (data.isNewClient) {
    payload.newClientDate = FieldValue.serverTimestamp();
  } else {
    payload.isNewClient = false;
  }

  if (payload.agencyId === undefined) {
    delete payload.agencyId;
  }

  const docRef = await clientsCollection.add(payload);

  if (context) {
    await logActivity({
      userId: context.userId,
      userName: context.userName,
      type: 'create',
      entityType: 'client',
      entityId: docRef.id,
      entityName: data.denominacion,
      details: `creó el cliente <a href="/clients/${docRef.id}" class="font-bold text-primary hover:underline">${data.denominacion}</a>`,
      ownerName: payload.ownerName as string,
    });
  }

  return docRef.id;
}

export async function updateClient(
  id: string,
  data: UpdateClientInput,
  context: ClientMutationContext,
): Promise<void> {
  const docRef = clientsCollection.doc(id);
  const original = await docRef.get();
  if (!original.exists) {
    throw new Error('Client not found');
  }

  const originalData = original.data() as Client;
  const updateData: Record<string, unknown> = { ...data };

  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  if (data.isDeactivated === true && originalData.isDeactivated === false) {
    updateData.deactivationHistory = FieldValue.arrayUnion(FieldValue.serverTimestamp());
  }

  await docRef.update({
    ...updateData,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const newOwnerName = data.ownerName ?? originalData.ownerName;
  const clientName = data.denominacion ?? originalData.denominacion;

  let details = `actualizó el cliente <a href="/clients/${id}" class="font-bold text-primary hover:underline">${clientName}</a>`;
  if (data.ownerId && data.ownerId !== originalData.ownerId) {
    details = `reasignó el cliente <strong>${clientName}</strong> a <strong>${newOwnerName}</strong>`;
  }
  if (data.isDeactivated === true && !originalData.isDeactivated) {
    details = `dio de baja al cliente <strong>${clientName}</strong>`;
  }
  if (data.isDeactivated === false && originalData.isDeactivated) {
    details = `reactivó al cliente <strong>${clientName}</strong>`;
  }

  await logActivity({
    userId: context.userId,
    userName: context.userName,
    type: 'update',
    entityType: 'client',
    entityId: id,
    entityName: clientName,
    details,
    ownerName: newOwnerName,
  });
}

export async function deleteClient(
  id: string,
  context: ClientMutationContext,
): Promise<void> {
  const clientRef = clientsCollection.doc(id);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new Error('Client not found');
  }
  const clientData = clientSnap.data() as Client;

  const batch = adminDb.batch();

  batch.delete(clientRef);

  const oppsSnap = await opportunitiesCollection.where('clientId', '==', id).get();
  oppsSnap.forEach((doc) => batch.delete(doc.ref));

  const activitiesSnap = await clientActivitiesCollection.where('clientId', '==', id).get();
  activitiesSnap.forEach((doc) => batch.delete(doc.ref));

  const peopleSnap = await peopleCollection.where('clientIds', 'array-contains', id).get();
  peopleSnap.forEach((doc) => batch.delete(doc.ref));

  const clientOppIds = oppsSnap.docs.map((doc) => doc.id);
  if (clientOppIds.length > 0) {
    const invoicesSnap = await invoicesCollection.where('opportunityId', 'in', clientOppIds).get();
    invoicesSnap.forEach((doc) => batch.delete(doc.ref));
  }

  await batch.commit();

  await logActivity({
    userId: context.userId,
    userName: context.userName,
    type: 'delete',
    entityType: 'client',
    entityId: id,
    entityName: clientData.denominacion,
    details: `eliminó el cliente <strong>${clientData.denominacion}</strong> y toda su información asociada`,
    ownerName: clientData.ownerName,
  });
}
