import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { logServerActivity } from '@/lib/server/activity';
import { autoUpdateCoachingSessionServer } from '@/lib/server/coaching';
import { serializeDocument } from '@/lib/server/firestore';
import { toTitleCase } from '@/lib/utils';
import type { Client, ClientActivity, Prospect, User } from '@/lib/types';
import type { ServerUser } from '@/lib/server/auth';

type CommanderUser = Pick<User, 'id' | 'name' | 'email' | 'role' | 'area' | 'sellerConfig'>;

function toServerUser(user: CommanderUser): ServerUser {
  return {
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    area: user.area,
    sellerConfig: user.sellerConfig || [],
  };
}

function cleanPayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function getCommanderUserName(user: CommanderUser) {
  return user.name || user.email || 'Usuario';
}

function mapProspect(id: string, data: FirebaseFirestore.DocumentData | undefined): Prospect {
  return serializeDocument<Prospect>(id, data);
}

function mapClient(id: string, data: FirebaseFirestore.DocumentData | undefined): Client {
  return serializeDocument<Client>(id, data);
}

export async function getCommanderProspects(): Promise<Prospect[]> {
  const snapshot = await dbAdmin.collection('prospects').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => mapProspect(doc.id, doc.data()));
}

export async function getCommanderClients(): Promise<Client[]> {
  const snapshot = await dbAdmin.collection('clients').orderBy('denominacion').get();
  return snapshot.docs.map(doc => mapClient(doc.id, doc.data()));
}

export async function createCommanderClient(
  clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>,
  currentUser: CommanderUser,
): Promise<string> {
  const requesterName = getCommanderUserName(currentUser);
  const denominacion = toTitleCase(String(clientData.denominacion || '').trim());

  if (!denominacion) {
    throw new Error('La denominacion del cliente es obligatoria.');
  }

  const newClientData = cleanPayload({
    ...clientData,
    denominacion,
    razonSocial: clientData.razonSocial ? toTitleCase(clientData.razonSocial) : '',
    personIds: [],
    ownerId: currentUser.id,
    ownerName: requesterName,
    createdAt: FieldValue.serverTimestamp(),
    isDeactivated: false,
    deactivationHistory: [],
    newClientDate: clientData.isNewClient ? FieldValue.serverTimestamp() : undefined,
    isNewClient: Boolean(clientData.isNewClient),
  } as Record<string, unknown>);

  const docRef = await dbAdmin.collection('clients').add(newClientData);

  await logServerActivity({
    userId: currentUser.id,
    userName: requesterName,
    type: 'create',
    entityType: 'client',
    entityId: docRef.id,
    entityName: denominacion,
    details: `creo el cliente <a href="/clients/${docRef.id}" class="font-bold text-primary hover:underline">${denominacion}</a>`,
    ownerName: requesterName,
  });

  return docRef.id;
}

export async function createCommanderProspect(
  prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>,
  currentUser: CommanderUser,
): Promise<string> {
  const companyName = String(prospectData.companyName || '').trim();
  if (!companyName) {
    throw new Error('El nombre del prospecto es obligatorio.');
  }

  const requesterName = getCommanderUserName(currentUser);
  const dataToSave = cleanPayload({
    ...prospectData,
    companyName,
    ownerId: currentUser.id,
    ownerName: requesterName,
    creatorId: currentUser.id,
    creatorName: requesterName,
    createdAt: FieldValue.serverTimestamp(),
  } as Record<string, unknown>);

  const docRef = await dbAdmin.collection('prospects').add(dataToSave);

  await logServerActivity({
    userId: currentUser.id,
    userName: requesterName,
    type: 'create',
    entityType: 'prospect',
    entityId: docRef.id,
    entityName: companyName,
    details: `creo el prospecto <strong>${companyName}</strong>`,
    ownerName: requesterName,
  });

  try {
    await autoUpdateCoachingSessionServer(
      currentUser.id,
      requesterName,
      'prospect',
      docRef.id,
      companyName,
      'Nuevo prospecto cargado en el sistema.',
      undefined,
      toServerUser(currentUser),
    );
  } catch (error) {
    console.error('Error auto-updating coaching from commander prospect:', error);
  }

  return docRef.id;
}

export async function createCommanderClientActivity(
  activityData: Omit<ClientActivity, 'id' | 'timestamp'>,
  currentUser: CommanderUser,
): Promise<string> {
  if (!activityData.type || !activityData.observation?.trim()) {
    throw new Error('Tipo y observacion son obligatorios.');
  }

  const requesterName = getCommanderUserName(currentUser);
  const dataToSave: Record<string, unknown> = {
    ...activityData,
    userId: currentUser.id,
    userName: requesterName,
    timestamp: FieldValue.serverTimestamp(),
  };

  if (activityData.isTask && activityData.dueDate) {
    dataToSave.dueDate = Timestamp.fromDate(new Date(activityData.dueDate));
  } else {
    delete dataToSave.dueDate;
  }

  if (!activityData.opportunityId || activityData.opportunityId === 'none') {
    delete dataToSave.opportunityId;
    delete dataToSave.opportunityTitle;
  }

  if (!activityData.clientId) delete dataToSave.clientId;
  if (!activityData.clientName) delete dataToSave.clientName;
  if (!activityData.prospectId) delete dataToSave.prospectId;
  if (!activityData.prospectName) delete dataToSave.prospectName;

  const docRef = await dbAdmin.collection('client-activities').add(cleanPayload(dataToSave));

  try {
    const entityType = activityData.clientId ? 'client' : 'prospect';
    const entityId = activityData.clientId || activityData.prospectId || '';
    const entityName = activityData.clientName || activityData.prospectName || '';
    if (entityId) {
      await autoUpdateCoachingSessionServer(
        currentUser.id,
        requesterName,
        entityType,
        entityId,
        entityName,
        `Actividad (${activityData.type}): ${activityData.observation}`,
        undefined,
        toServerUser(currentUser),
      );
    }
  } catch (error) {
    console.error('Error auto-updating coaching from commander activity:', error);
  }

  return docRef.id;
}
