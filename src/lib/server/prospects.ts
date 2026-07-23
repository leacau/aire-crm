import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { differenceInCalendarDays } from 'date-fns';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { Prospect } from '@/lib/types';

export class ProspectApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function getRequesterName(requester: ServerUser) {
  return requester.name || requester.email || 'Usuario';
}

function mapProspect(id: string, data: FirebaseFirestore.DocumentData | undefined): Prospect {
  return serializeDocument<Prospect>(id, data);
}

function toDate(value: unknown): Date | null {
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function cleanProspectPayload(payload: Partial<Prospect>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'updatedAt'
      && key !== 'ownerId'
      && key !== 'ownerName'
      && key !== 'creatorId'
      && key !== 'creatorName'
      && value !== undefined
    )),
  );
}

function cleanProspectUpdatePayload(payload: Partial<Prospect>) {
  const updateData = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      key !== 'id'
      && key !== 'createdAt'
      && key !== 'creatorId'
      && key !== 'creatorName'
      && value !== undefined
    )),
  ) as Record<string, unknown>;

  updateData.updatedAt = FieldValue.serverTimestamp();
  return updateData;
}

function requireProspectFound(snapshot: FirebaseFirestore.DocumentSnapshot) {
  if (!snapshot.exists) {
    throw new ProspectApiError('Prospecto no encontrado.', 404);
  }
}

function requireProspectAccess(prospect: Prospect, requester: ServerUser) {
  if (requester.uid !== prospect.ownerId && !hasServerManagementPrivileges(requester)) {
    throw new ProspectApiError('Forbidden', 403);
  }
}

function normalizeIds(rawIds: unknown): string[] {
  return Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];
}

export async function listProspectsServer(): Promise<Prospect[]> {
  const snapshot = await dbAdmin.collection('prospects').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => mapProspect(doc.id, doc.data()));
}

export async function createProspectServer(rawProspectData: unknown, requester: ServerUser): Promise<string> {
  const prospectData = rawProspectData as Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'> | undefined;

  if (!prospectData?.companyName?.trim()) {
    throw new ProspectApiError('El nombre de la empresa es obligatorio.', 400);
  }

  const requesterName = getRequesterName(requester);
  const dataToSave = {
    ...cleanProspectPayload(prospectData),
    ownerId: requester.uid,
    ownerName: requesterName,
    creatorId: requester.uid,
    creatorName: requesterName,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('prospects').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'prospect',
    entityId: docRef.id,
    entityName: prospectData.companyName,
    details: `creo el prospecto <strong>${prospectData.companyName}</strong>`,
    ownerName: requesterName,
  });

  return docRef.id;
}

export async function updateProspectServer(
  prospectId: string,
  rawData: unknown,
  requester: ServerUser,
): Promise<Prospect> {
  const data = rawData as Partial<Omit<Prospect, 'id'>> | undefined;

  if (!data || Object.keys(data).length === 0) {
    throw new ProspectApiError('No hay cambios para aplicar.', 400);
  }

  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  const prospectSnap = await docRef.get();
  requireProspectFound(prospectSnap);

  const originalData = mapProspect(prospectSnap.id, prospectSnap.data());
  requireProspectAccess(originalData, requester);

  const updateData = cleanProspectUpdatePayload(data);
  if (!hasServerManagementPrivileges(requester)) {
    delete updateData.ownerId;
    delete updateData.ownerName;
    delete updateData.previousOwnerId;
    delete updateData.unassignedAt;
    delete updateData.claimStatus;
    delete updateData.claimantId;
    delete updateData.claimantName;
    delete updateData.claimedAt;
  }

  await docRef.update(updateData);

  let details = `actualizo el prospecto <strong>${originalData.companyName}</strong>`;
  if (data.status && data.status !== originalData.status) {
    details = `cambio el estado del prospecto <strong>${originalData.companyName}</strong> a <strong>${data.status}</strong>`;
  }

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: originalData.companyName,
    details,
    ownerName: originalData.ownerName,
  });

  return originalData;
}

export async function deleteProspectServer(prospectId: string, requester: ServerUser): Promise<void> {
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  const prospectSnap = await docRef.get();
  requireProspectFound(prospectSnap);

  const prospect = mapProspect(prospectSnap.id, prospectSnap.data());
  requireProspectAccess(prospect, requester);

  await docRef.delete();

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'delete',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: prospect.companyName,
    details: `elimino el prospecto <strong>${prospect.companyName}</strong>`,
    ownerName: prospect.ownerName,
  });
}

export async function claimProspectServer(prospectId: string, requester: ServerUser): Promise<void> {
  const requesterName = getRequesterName(requester);
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  let prospectName = 'Prospecto';

  await dbAdmin.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) throw new ProspectApiError('El prospecto ya no existe.', 400);

    const currentProspect = { id: snapshot.id, ...snapshot.data() } as Prospect;
    prospectName = currentProspect.companyName;

    if (currentProspect.ownerId) {
      throw new ProspectApiError('El prospecto ya fue asignado a otro asesor.', 400);
    }
    if (currentProspect.claimStatus === 'Pendiente') {
      throw new ProspectApiError(
        currentProspect.claimantId === requester.uid
          ? 'Tu reclamo ya esta pendiente de aprobacion.'
          : 'Otro asesor ya reclamo este prospecto.',
        400,
      );
    }

    if (currentProspect.previousOwnerId === requester.uid && currentProspect.unassignedAt) {
      const unassignedDate = toDate(currentProspect.unassignedAt);
      if (unassignedDate) {
        const daysPassed = differenceInCalendarDays(new Date(), unassignedDate);
        if (daysPassed < 3) {
          throw new ProspectApiError(`Debes esperar ${3 - daysPassed} dias mas para volver a reclamar este prospecto.`, 400);
        }
      }
    }

    transaction.update(docRef, {
      claimStatus: 'Pendiente',
      claimantId: requester.uid,
      claimantName: requesterName,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: prospectName,
    details: `solicito reclamar el prospecto <strong>${prospectName}</strong>`,
    ownerName: 'Sin Asignar',
  });
}

export async function approveProspectClaimServer(prospectId: string, requester: ServerUser): Promise<void> {
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  const snapshot = await docRef.get();
  requireProspectFound(snapshot);

  const prospect = mapProspect(snapshot.id, snapshot.data());
  if (!prospect.claimantId || !prospect.claimantName) {
    throw new ProspectApiError('No hay reclamante valido.', 400);
  }

  await docRef.update({
    ownerId: prospect.claimantId,
    ownerName: prospect.claimantName,
    status: 'Nuevo',
    statusChangedAt: FieldValue.serverTimestamp(),
    claimStatus: FieldValue.delete(),
    claimantId: FieldValue.delete(),
    claimantName: FieldValue.delete(),
    claimedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: prospect.companyName,
    details: `aprobo el reclamo y asigno el prospecto a <strong>${prospect.claimantName}</strong>`,
    ownerName: prospect.claimantName,
  });
}

export async function rejectProspectClaimServer(prospectId: string, requester: ServerUser): Promise<void> {
  const docRef = dbAdmin.collection('prospects').doc(prospectId);
  const snapshot = await docRef.get();
  requireProspectFound(snapshot);

  const prospect = mapProspect(snapshot.id, snapshot.data());

  await docRef.update({
    claimStatus: FieldValue.delete(),
    claimantId: FieldValue.delete(),
    claimantName: FieldValue.delete(),
    claimedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'prospect',
    entityId: prospectId,
    entityName: prospect.companyName,
    details: `rechazo la solicitud de reclamo de <strong>${prospect.claimantName || prospect.companyName}</strong>`,
    ownerName: 'Sin Asignar',
  });
}

export async function bulkReleaseProspectsServer(rawProspectIds: unknown, requester: ServerUser): Promise<void> {
  const prospectIds = normalizeIds(rawProspectIds);
  if (prospectIds.length === 0) return;

  for (let index = 0; index < prospectIds.length; index += 450) {
    const batch = dbAdmin.batch();
    prospectIds.slice(index, index + 450).forEach(id => {
      batch.update(dbAdmin.collection('prospects').doc(id), {
        ownerId: '',
        ownerName: 'Sin Asignar',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'prospect',
    entityId: 'multiple_release',
    entityName: `${prospectIds.length} prospectos`,
    details: `libero automaticamente <strong>${prospectIds.length}</strong> prospectos por inactividad.`,
    ownerName: 'Sistema',
  });
}

export async function registerProspectNotificationsServer(rawProspectIds: unknown, requester: ServerUser): Promise<void> {
  const prospectIds = normalizeIds(rawProspectIds);
  if (prospectIds.length === 0) return;

  for (let index = 0; index < prospectIds.length; index += 450) {
    const batch = dbAdmin.batch();
    prospectIds.slice(index, index + 450).forEach(prospectId => {
      batch.update(dbAdmin.collection('prospects').doc(prospectId), {
        lastProspectNotificationAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'prospect',
    entityId: 'prospect_notifications',
    entityName: 'Notificaciones de prospectos',
    details: `envio recordatorios de seguimiento para ${prospectIds.length} prospecto(s).`,
    ownerName: requesterName,
  });
}
