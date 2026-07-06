import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { serializeDocument, serializeFirestoreValue } from '@/lib/server/firestore';
import { logServerActivity } from '@/lib/server/activity';
import { toTitleCase } from '@/lib/utils';
import type { Client } from '@/lib/types';
import type { ServerUser } from '@/lib/server/auth';

const CLIENT_COLLECTION = 'clients';

export function mapClient(id: string, data: FirebaseFirestore.DocumentData | undefined): Client {
  const serialized = serializeDocument<Client>(id, data);
  return {
    ...serialized,
    denominacion: serialized.denominacion ? toTitleCase(serialized.denominacion) : serialized.denominacion,
    razonSocial: serialized.razonSocial ? toTitleCase(serialized.razonSocial) : serialized.razonSocial,
    razonSocialTango: serialized.razonSocialTango ? toTitleCase(serialized.razonSocialTango) : serialized.razonSocialTango,
  };
}

export function cleanObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined),
  ) as Partial<T>;
}

export function getRequesterName(user: ServerUser) {
  return user.name || user.email || 'Usuario';
}

export async function deleteClientGraph(clientId: string) {
  const clientRef = dbAdmin.collection(CLIENT_COLLECTION).doc(clientId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new Error('Client not found');
  }

  const [oppsSnap, peopleSnap, activitiesSnap] = await Promise.all([
    dbAdmin.collection('opportunities').where('clientId', '==', clientId).get(),
    dbAdmin.collection('people').where('clientIds', 'array-contains', clientId).get(),
    dbAdmin.collection('client-activities').where('clientId', '==', clientId).get(),
  ]);

  const refsToDelete: FirebaseFirestore.DocumentReference[] = [
    clientRef,
    ...oppsSnap.docs.map(doc => doc.ref),
    ...peopleSnap.docs.map(doc => doc.ref),
    ...activitiesSnap.docs.map(doc => doc.ref),
  ];

  const opportunityIds = oppsSnap.docs.map(doc => doc.id);
  for (let index = 0; index < opportunityIds.length; index += 30) {
    const chunk = opportunityIds.slice(index, index + 30);
    if (chunk.length === 0) continue;
    const invoicesSnap = await dbAdmin.collection('invoices').where('opportunityId', 'in', chunk).get();
    refsToDelete.push(...invoicesSnap.docs.map(doc => doc.ref));
  }

  for (let index = 0; index < refsToDelete.length; index += 450) {
    const batch = dbAdmin.batch();
    refsToDelete.slice(index, index + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  return mapClient(clientSnap.id, clientSnap.data());
}

export async function logClientUpdate(
  requester: ServerUser,
  clientId: string,
  originalData: Client,
  data: Partial<Omit<Client, 'id'>>,
) {
  const requesterName = getRequesterName(requester);
  const newOwnerName = data.ownerName !== undefined ? data.ownerName : originalData.ownerName;
  const clientName = data.denominacion || originalData.denominacion;

  let details = `actualizo el cliente <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${clientName}</a>`;
  if (data.ownerId && data.ownerId !== originalData.ownerId) {
    details = `reasigno el cliente <strong>${clientName}</strong> a <strong>${newOwnerName}</strong>`;
  }
  if (data.isDeactivated === true && !originalData.isDeactivated) {
    details = `dio de baja al cliente <strong>${clientName}</strong>`;
  }
  if (data.isDeactivated === false && originalData.isDeactivated) {
    details = `reactivo al cliente <strong>${clientName}</strong>`;
  }

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'client',
    entityId: clientId,
    entityName: clientName,
    details,
    ownerName: newOwnerName,
  });
}

export function clientResponseValue(value: unknown) {
  return serializeFirestoreValue(value);
}

export { FieldValue };

