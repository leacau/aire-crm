import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { getAccessibleClient } from '@/lib/server/client-access';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument, serializeFirestoreValue } from '@/lib/server/firestore';
import { getRequesterName } from '@/lib/server/requester';
import { toTitleCase } from '@/lib/utils';
import type { ClientTangoIdField, ClientTangoSyncedField, ClientTangoUpdate } from '@/lib/api-contracts';
import type {
  AdvertisingOrder,
  BillingRequest,
  Client,
  ClientActivity,
  Opportunity,
  Person,
} from '@/lib/types';

export { FieldValue };

const CLIENT_COLLECTION = 'clients';
const TANGO_ID_FIELDS = new Set<ClientTangoIdField>(['idAire', 'idAireSrl', 'idAireDigital']);
const TANGO_SYNCED_FIELDS = new Set<ClientTangoSyncedField>([
  'isTangoSyncedAire',
  'isTangoSyncedSrl',
  'isTangoSyncedSas',
]);
const TANGO_ADMIN_UPDATE_FIELDS = new Set<keyof ClientTangoUpdate>([
  'tangoCompanyId',
  'idTango',
  'razonSocialTango',
  'idAireSrl',
  'idAireDigital',
  'idAire',
]);

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

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

export function clientResponseValue(value: unknown) {
  return serializeFirestoreValue(value);
}

function isTangoSyncedField(value: unknown): value is ClientTangoSyncedField {
  return typeof value === 'string' && TANGO_SYNCED_FIELDS.has(value as ClientTangoSyncedField);
}

function isTangoIdField(value: unknown): value is ClientTangoIdField {
  return typeof value === 'string' && TANGO_ID_FIELDS.has(value as ClientTangoIdField);
}

function requireClientFound(snap: FirebaseFirestore.DocumentSnapshot) {
  if (!snap.exists) {
    throw new ClientApiError('Client not found', 404);
  }
}

function requireClientAccess(client: Client, requester: ServerUser) {
  if (!hasServerManagementPrivileges(requester) && client.ownerId !== requester.uid) {
    throw new ClientApiError('Forbidden', 403);
  }
}

function buildTangoUpdatePayload(data: ClientTangoUpdate) {
  const updatePayload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.cuit?.trim()) updatePayload.cuit = data.cuit.trim();
  if (data.razonSocialTango?.trim()) updatePayload.razonSocialTango = toTitleCase(data.razonSocialTango.trim());
  if (data.tangoCompanyId?.toString().trim()) {
    updatePayload.tangoCompanyId = data.tangoCompanyId.toString().trim();
    updatePayload.idTango = updatePayload.tangoCompanyId;
  } else if (data.idTango?.toString().trim()) {
    updatePayload.idTango = data.idTango.toString().trim();
    updatePayload.tangoCompanyId = updatePayload.idTango;
  }
  if (data.email?.trim()) updatePayload.email = data.email.trim();
  if (data.phone?.trim()) updatePayload.phone = data.phone.trim();
  if (data.rubro?.trim()) updatePayload.rubro = data.rubro.trim();
  if (data.razonSocial?.trim()) updatePayload.razonSocial = toTitleCase(data.razonSocial.trim());
  if (data.denominacion?.trim()) updatePayload.denominacion = toTitleCase(data.denominacion.trim());
  if (data.idAireSrl?.toString().trim()) updatePayload.idAireSrl = data.idAireSrl.toString().trim();
  if (data.idAireDigital?.toString().trim()) updatePayload.idAireDigital = data.idAireDigital.toString().trim();
  if (data.idAire?.toString().trim()) updatePayload.idAire = data.idAire.toString().trim();
  if (data.condicionIVA?.trim()) updatePayload.condicionIVA = data.condicionIVA.trim();
  if (data.provincia?.trim()) updatePayload.provincia = data.provincia.trim();
  if (data.localidad?.trim()) updatePayload.localidad = data.localidad.trim();
  if (data.tipoEntidad?.trim()) updatePayload.tipoEntidad = data.tipoEntidad.trim();
  if (data.observaciones?.trim()) updatePayload.observaciones = data.observaciones.trim();

  return cleanObject(updatePayload);
}

function buildTangoDetailText(updatePayload: Record<string, unknown>, originalData: Client) {
  const detailsParts: string[] = [];

  if (updatePayload.cuit && updatePayload.cuit !== originalData.cuit) detailsParts.push(`CUIT <strong>${updatePayload.cuit}</strong>`);
  if (updatePayload.tangoCompanyId && updatePayload.tangoCompanyId !== originalData.tangoCompanyId) detailsParts.push(`ID de Tango <strong>${updatePayload.tangoCompanyId}</strong>`);
  if (updatePayload.email && updatePayload.email !== originalData.email) detailsParts.push(`Email <strong>${updatePayload.email}</strong>`);
  if (updatePayload.phone && updatePayload.phone !== originalData.phone) detailsParts.push(`Telefono <strong>${updatePayload.phone}</strong>`);
  if (updatePayload.rubro && updatePayload.rubro !== originalData.rubro) detailsParts.push(`Rubro <strong>${updatePayload.rubro}</strong>`);
  if (updatePayload.razonSocial && updatePayload.razonSocial !== originalData.razonSocial) detailsParts.push(`Razon Social <strong>${updatePayload.razonSocial}</strong>`);
  if (updatePayload.denominacion && updatePayload.denominacion !== originalData.denominacion) detailsParts.push(`Denominacion <strong>${updatePayload.denominacion}</strong>`);
  if (updatePayload.idAireSrl && updatePayload.idAireSrl !== originalData.idAireSrl) detailsParts.push(`ID Aire SRL <strong>${updatePayload.idAireSrl}</strong>`);
  if (updatePayload.idAireDigital && updatePayload.idAireDigital !== originalData.idAireDigital) detailsParts.push(`ID Aire Digital <strong>${updatePayload.idAireDigital}</strong>`);
  if (updatePayload.idAire && updatePayload.idAire !== originalData.idAire) detailsParts.push(`ID Aire <strong>${updatePayload.idAire}</strong>`);
  if (updatePayload.condicionIVA && updatePayload.condicionIVA !== originalData.condicionIVA) detailsParts.push(`Condicion IVA <strong>${updatePayload.condicionIVA}</strong>`);
  if (updatePayload.provincia && updatePayload.provincia !== originalData.provincia) detailsParts.push(`Provincia <strong>${updatePayload.provincia}</strong>`);
  if (updatePayload.localidad && updatePayload.localidad !== originalData.localidad) detailsParts.push(`Localidad <strong>${updatePayload.localidad}</strong>`);
  if (updatePayload.tipoEntidad && updatePayload.tipoEntidad !== originalData.tipoEntidad) detailsParts.push(`Tipo de Entidad <strong>${updatePayload.tipoEntidad}</strong>`);
  if (updatePayload.observaciones && updatePayload.observaciones !== originalData.observaciones) detailsParts.push('Observaciones');

  return detailsParts.length > 0 ? detailsParts.join(' y ') : 'datos de Tango';
}

async function commitWhenNeeded(state: { batch: FirebaseFirestore.WriteBatch; count: number }) {
  if (state.count >= 450) {
    await state.batch.commit();
    state.batch = dbAdmin.batch();
    state.count = 0;
  }
}

async function updateMatchingDocs(
  state: { batch: FirebaseFirestore.WriteBatch; count: number },
  collectionName: string,
  field: string,
  sourceClientId: string,
  dataToUpdate: Record<string, unknown>,
) {
  const snapshot = await dbAdmin.collection(collectionName).where(field, '==', sourceClientId).get();
  for (const doc of snapshot.docs) {
    state.batch.update(doc.ref, dataToUpdate);
    state.count += 1;
    await commitWhenNeeded(state);
  }
}

export async function listClientsServer(requester?: ServerUser): Promise<Client[]> {
  if (requester && !hasServerManagementPrivileges(requester)) {
    const snapshot = await dbAdmin.collection(CLIENT_COLLECTION).where('ownerId', '==', requester.uid).get();
    return snapshot.docs
      .map(doc => mapClient(doc.id, doc.data()))
      .sort((a, b) => (a.denominacion || '').localeCompare(b.denominacion || '', 'es'));
  }

  const snapshot = await dbAdmin.collection(CLIENT_COLLECTION).orderBy('denominacion').get();
  return snapshot.docs.map(doc => mapClient(doc.id, doc.data()));
}

export async function createClientServer(rawBody: unknown, requester: ServerUser): Promise<string> {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const clientData = body.clientData && typeof body.clientData === 'object'
    ? body.clientData as Partial<Client>
    : {};
  const requesterName = getRequesterName(requester);
  const canAssignOwner = hasServerManagementPrivileges(requester);
  const ownerId = canAssignOwner && body.ownerId ? String(body.ownerId) : requester.uid;
  const ownerName = canAssignOwner && body.ownerName ? String(body.ownerName) : requesterName;

  const denominacion = toTitleCase(String(clientData.denominacion || '').trim());
  if (!denominacion) {
    throw new ClientApiError('La denominacion es obligatoria.', 400);
  }

  const newClientData = cleanObject({
    ...clientData,
    denominacion,
    razonSocial: clientData.razonSocial ? toTitleCase(clientData.razonSocial) : '',
    personIds: [],
    ownerId,
    ownerName,
    createdAt: FieldValue.serverTimestamp(),
    isDeactivated: false,
    deactivationHistory: [],
    newClientDate: clientData.isNewClient ? FieldValue.serverTimestamp() : undefined,
    isNewClient: Boolean(clientData.isNewClient),
  } as Record<string, unknown>);

  const docRef = await dbAdmin.collection(CLIENT_COLLECTION).add(newClientData);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'client',
    entityId: docRef.id,
    entityName: denominacion,
    details: `creo el cliente <a href="/clients/${docRef.id}" class="font-bold text-primary hover:underline">${denominacion}</a>`,
    ownerName,
  });

  return docRef.id;
}

export async function getClientServer(clientId: string, requester: ServerUser): Promise<Client> {
  const client = await getAccessibleClient(clientId, requester);
  if (!client) {
    throw new ClientApiError('Forbidden', 403);
  }
  return client;
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

export async function updateClientServer(
  clientId: string,
  rawData: unknown,
  requester: ServerUser,
): Promise<void> {
  const data = (rawData || {}) as Partial<Omit<Client, 'id'>>;
  const docRef = dbAdmin.collection(CLIENT_COLLECTION).doc(clientId);
  const originalDoc = await docRef.get();
  requireClientFound(originalDoc);

  const originalData = mapClient(originalDoc.id, originalDoc.data());
  const canManageClients = hasServerManagementPrivileges(requester);

  if (!canManageClients && originalData.ownerId !== requester.uid) {
    throw new ClientApiError('Forbidden', 403);
  }

  if (!canManageClients && (data.ownerId !== undefined || data.ownerName !== undefined)) {
    throw new ClientApiError('Forbidden', 403);
  }

  const updateData = cleanObject({
    ...data,
    denominacion: data.denominacion ? toTitleCase(data.denominacion) : data.denominacion,
    razonSocial: data.razonSocial ? toTitleCase(data.razonSocial) : data.razonSocial,
    updatedAt: FieldValue.serverTimestamp(),
    deactivationHistory:
      data.isDeactivated === true && !originalData.isDeactivated
        ? FieldValue.arrayUnion(FieldValue.serverTimestamp())
        : undefined,
  } as Record<string, unknown>);

  await docRef.update(updateData);
  await logClientUpdate(requester, clientId, originalData, data);
}

export async function deleteClientGraph(clientId: string) {
  const clientRef = dbAdmin.collection(CLIENT_COLLECTION).doc(clientId);
  const clientSnap = await clientRef.get();
  requireClientFound(clientSnap);

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

export async function deleteClientServer(clientId: string, requester: ServerUser): Promise<void> {
  const clientData = await deleteClientGraph(clientId);
  const requesterName = getRequesterName(requester);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'client',
    entityId: clientId,
    entityName: clientData.denominacion,
    details: `elimino el cliente <strong>${clientData.denominacion}</strong> y toda su informacion asociada`,
    ownerName: clientData.ownerName,
  });
}

export async function bulkDeleteClientsServer(clientIds: string[], requester: ServerUser): Promise<void> {
  for (const clientId of clientIds) {
    await deleteClientGraph(clientId);
  }

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'client',
    entityId: 'multiple',
    entityName: 'multiple',
    details: `elimino <strong>${clientIds.length}</strong> clientes de forma masiva`,
    ownerName: requesterName,
  });
}

export async function bulkUpdateClientsServer(
  updates: { id: string; denominacion: string; data: Partial<Omit<Client, 'id'>> }[],
  requester: ServerUser,
): Promise<void> {
  for (let index = 0; index < updates.length; index += 450) {
    const batch = dbAdmin.batch();
    updates.slice(index, index + 450).forEach(({ id, data }) => {
      const docRef = dbAdmin.collection(CLIENT_COLLECTION).doc(id);
      batch.update(docRef, cleanObject({ ...data, updatedAt: FieldValue.serverTimestamp() } as Record<string, unknown>));
    });
    await batch.commit();
  }

  const isReassign = updates.length > 0 && updates[0].data.ownerName;
  if (isReassign) {
    const requesterName = getRequesterName(requester);
    const newOwnerName = updates[0].data.ownerName;
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'client',
      entityId: 'multiple',
      entityName: 'multiple',
      details: `reasigno <strong>${updates.length}</strong> clientes a <strong>${newOwnerName}</strong>`,
      ownerName: newOwnerName,
    });
  }
}

export async function mergeClientsServer(
  targetClientId: string,
  sourceClientId: string,
  requester: ServerUser,
): Promise<void> {
  if (!targetClientId || !sourceClientId) {
    throw new ClientApiError('targetClientId y sourceClientId son obligatorios.', 400);
  }
  if (targetClientId === sourceClientId) {
    throw new ClientApiError('No puedes fusionar un cliente consigo mismo.', 400);
  }

  const targetRef = dbAdmin.collection(CLIENT_COLLECTION).doc(targetClientId);
  const sourceRef = dbAdmin.collection(CLIENT_COLLECTION).doc(sourceClientId);
  const [targetSnap, sourceSnap] = await Promise.all([targetRef.get(), sourceRef.get()]);

  if (!targetSnap.exists || !sourceSnap.exists) {
    throw new ClientApiError('Uno de los clientes no existe.', 404);
  }

  const targetData = mapClient(targetSnap.id, targetSnap.data());
  const sourceData = mapClient(sourceSnap.id, sourceSnap.data());
  const targetName = targetData.denominacion;
  const state = { batch: dbAdmin.batch(), count: 0 };

  await updateMatchingDocs(state, 'opportunities', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
  await updateMatchingDocs(state, 'advertising_orders', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
  await updateMatchingDocs(state, 'billing_requests', 'clientId', sourceClientId, { clientId: targetClientId });
  await updateMatchingDocs(state, 'client-activities', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });

  const peopleSnap = await dbAdmin.collection('people').where('clientIds', 'array-contains', sourceClientId).get();
  for (const doc of peopleSnap.docs) {
    const data = doc.data();
    const newIds = Array.isArray(data.clientIds) ? data.clientIds.filter((id: string) => id !== sourceClientId) : [];
    if (!newIds.includes(targetClientId)) newIds.push(targetClientId);
    state.batch.update(doc.ref, { clientIds: newIds });
    state.count += 1;
    await commitWhenNeeded(state);
  }

  await updateMatchingDocs(state, 'commercial_notes', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
  await updateMatchingDocs(state, 'social_media_requests', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
  await updateMatchingDocs(state, 'web_notes', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });
  await updateMatchingDocs(state, 'canjes', 'clienteId', sourceClientId, { clienteId: targetClientId, clienteName: targetName });
  await updateMatchingDocs(state, 'convenios', 'clientId', sourceClientId, { clientId: targetClientId, clientName: targetName });

  state.batch.delete(sourceRef);
  await state.batch.commit();

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'delete',
    entityType: 'client',
    entityId: targetClientId,
    entityName: targetName,
    details: `fusiono el cliente duplicado <strong>${sourceData.denominacion}</strong> hacia este cliente, migrando todo su historial.`,
    ownerName: targetData.ownerName || 'Sistema',
  });
}

export async function listClientActivitiesForClientServer(clientId: string, requester: ServerUser): Promise<ClientActivity[]> {
  await getClientServer(clientId, requester);

  const snapshot = await dbAdmin
    .collection('client-activities')
    .where('clientId', '==', clientId)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map(doc => serializeDocument<ClientActivity>(doc.id, doc.data()));
}

export async function listClientPeopleServer(clientId: string, requester: ServerUser): Promise<Person[]> {
  await getClientServer(clientId, requester);
  const snapshot = await dbAdmin.collection('people').where('clientIds', 'array-contains', clientId).get();
  return snapshot.docs.map(doc => serializeDocument<Person>(doc.id, doc.data()));
}

export async function listClientOpportunitiesServer(clientId: string, requester: ServerUser): Promise<Opportunity[]> {
  await getClientServer(clientId, requester);
  const snapshot = await dbAdmin.collection('opportunities').where('clientId', '==', clientId).get();
  return snapshot.docs.map(doc => serializeDocument<Opportunity>(doc.id, doc.data()));
}

export async function listClientBillingRequestsServer(
  clientId: string,
  requester: ServerUser,
): Promise<BillingRequest[]> {
  await getClientServer(clientId, requester);
  const snapshot = await dbAdmin.collection('billing_requests').where('clientId', '==', clientId).get();
  return snapshot.docs
    .map(doc => serializeDocument<BillingRequest>(doc.id, doc.data()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function listClientAdvertisingOrdersServer(
  clientId: string,
  requester: ServerUser,
): Promise<AdvertisingOrder[]> {
  await getClientServer(clientId, requester);
  const snapshot = await dbAdmin.collection('advertising_orders').where('clientId', '==', clientId).get();
  return snapshot.docs
    .map(doc => serializeDocument<AdvertisingOrder>(doc.id, doc.data()))
    .sort((a, b) => (b.startDate || b.createdAt || '').localeCompare(a.startDate || a.createdAt || ''));
}

export async function updateClientTangoMappingServer(
  clientId: string,
  rawData: unknown,
  markSyncedField: unknown,
  requester: ServerUser,
): Promise<void> {
  const data = (rawData || {}) as ClientTangoUpdate;
  const updatePayload = buildTangoUpdatePayload(data);
  const canManageTangoMapping = hasServerManagementPrivileges(requester);
  const hasAdminTangoUpdate = Object.keys(data).some(key => TANGO_ADMIN_UPDATE_FIELDS.has(key as keyof ClientTangoUpdate));

  if (markSyncedField !== undefined) {
    if (!isTangoSyncedField(markSyncedField)) {
      throw new ClientApiError('Campo de sincronizacion invalido.', 400);
    }
    updatePayload[markSyncedField] = true;
  }

  const docRef = dbAdmin.collection(CLIENT_COLLECTION).doc(clientId);
  const originalDoc = await docRef.get();
  requireClientFound(originalDoc);

  const originalData = mapClient(originalDoc.id, originalDoc.data());
  requireClientAccess(originalData, requester);

  if (!canManageTangoMapping && (hasAdminTangoUpdate || markSyncedField !== undefined)) {
    throw new ClientApiError('Forbidden', 403);
  }

  await docRef.update(updatePayload);

  const detailText = buildTangoDetailText(updatePayload, originalData);
  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'client',
    entityId: clientId,
    entityName: originalData.denominacion,
    details: `actualizo ${detailText} para <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${originalData.denominacion}</a>`,
    ownerName: originalData.ownerName,
  });
}

export async function deleteClientTangoMappingServer(
  clientId: string,
  crmIdField: unknown,
  syncedField: unknown,
  requester: ServerUser,
): Promise<void> {
  if (!isTangoIdField(crmIdField) || !isTangoSyncedField(syncedField)) {
    throw new ClientApiError('Campos de Tango invalidos.', 400);
  }

  const docRef = dbAdmin.collection(CLIENT_COLLECTION).doc(clientId);
  const originalDoc = await docRef.get();
  requireClientFound(originalDoc);

  const originalData = mapClient(originalDoc.id, originalDoc.data());
  await docRef.update({
    [crmIdField]: FieldValue.delete(),
    [syncedField]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'client',
    entityId: clientId,
    entityName: originalData.denominacion,
    details: `quito el mapeo de Tango de <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${originalData.denominacion}</a>`,
    ownerName: originalData.ownerName,
  });
}
