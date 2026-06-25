import { differenceInCalendarDays, parseISO } from 'date-fns';
import { FieldValue } from 'firebase-admin/firestore';

import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/server/api-error';
import { logServerActivity } from '@/lib/server/activity';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import type { Prospect } from '../../domain/prospect';
import type { CreateProspectRequest, UpdateProspectRequest } from '../../application/prospect-schemas';

const prospectsCollection = dbAdmin.collection('prospects');

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
  }
  return undefined;
}

function serializeProspect(id: string, data: FirebaseFirestore.DocumentData): Prospect {
  return {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt) || new Date(0).toISOString(),
    updatedAt: timestampToIso(data.updatedAt),
    statusChangedAt: timestampToIso(data.statusChangedAt),
    lastProspectNotificationAt: timestampToIso(data.lastProspectNotificationAt),
    unassignedAt: timestampToIso(data.unassignedAt),
    claimedAt: timestampToIso(data.claimedAt),
  } as Prospect;
}

function belongsToOrganization(
  data: FirebaseFirestore.DocumentData,
  organizationId: string,
): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  return organizationId === DEFAULT_ORGANIZATION_ID;
}

async function getProspectSnapshot(id: string, organizationId: string) {
  const snapshot = await prospectsCollection.doc(id).get();
  if (!snapshot.exists || !belongsToOrganization(snapshot.data() || {}, organizationId)) {
    throw new ApiError(404, 'El prospecto no existe.', 'PROSPECT_NOT_FOUND');
  }
  return snapshot;
}

function assertCanModifyProspect(user: ServerUser, prospect: Prospect): void {
  if (hasServerManagementPrivileges(user)) return;
  if (prospect.ownerId !== user.uid) {
    throw new ApiError(403, 'Solo el responsable puede modificar este prospecto.', 'PROSPECT_FORBIDDEN');
  }
}

function assertNoPrivilegedOwnershipChange(user: ServerUser, input: UpdateProspectRequest): void {
  if (hasServerManagementPrivileges(user)) return;
  if (
    'ownerId' in input ||
    'ownerName' in input ||
    'previousOwnerId' in input ||
    'unassignedAt' in input ||
    'claimStatus' in input ||
    'claimantId' in input ||
    'claimantName' in input ||
    'claimedAt' in input
  ) {
    throw new ApiError(403, 'Solo un responsable de gestión puede reasignar prospectos.', 'PROSPECT_ASSIGNMENT_FORBIDDEN');
  }
}

export async function listProspectsForOrganization(organizationId: string): Promise<Prospect[]> {
  const snapshot = organizationId === DEFAULT_ORGANIZATION_ID
    ? await prospectsCollection.orderBy('createdAt', 'desc').get()
    : await prospectsCollection.where('organizationId', '==', organizationId).get();

  return snapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId))
    .map(document => serializeProspect(document.id, document.data()))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function createProspectOnServer(
  input: CreateProspectRequest,
  user: ServerUser,
): Promise<string> {
  const reference = await prospectsCollection.add({
    ...input,
    organizationId: user.organizationId,
    ownerId: user.uid,
    ownerName: user.name,
    creatorId: user.uid,
    creatorName: user.name,
    createdAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'create',
    entityType: 'prospect',
    entityId: reference.id,
    entityName: input.companyName,
    details: `creó el prospecto <strong>${input.companyName}</strong>`,
    ownerName: user.name,
    organizationId: user.organizationId,
  });

  return reference.id;
}

export async function updateProspectOnServer(
  id: string,
  input: UpdateProspectRequest,
  user: ServerUser,
): Promise<void> {
  const snapshot = await getProspectSnapshot(id, user.organizationId);
  const current = serializeProspect(snapshot.id, snapshot.data() || {});
  assertCanModifyProspect(user, current);
  assertNoPrivilegedOwnershipChange(user, input);

  await snapshot.ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });

  const details = input.status && input.status !== current.status
    ? `cambió el estado del prospecto <strong>${current.companyName}</strong> a <strong>${input.status}</strong>`
    : `actualizó el prospecto <strong>${current.companyName}</strong>`;

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'prospect',
    entityId: id,
    entityName: current.companyName,
    details,
    ownerName: input.ownerName || current.ownerName,
    organizationId: user.organizationId,
  });
}

export async function deleteProspectOnServer(id: string, user: ServerUser): Promise<void> {
  const snapshot = await getProspectSnapshot(id, user.organizationId);
  const current = serializeProspect(snapshot.id, snapshot.data() || {});
  assertCanModifyProspect(user, current);
  await snapshot.ref.delete();

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'delete',
    entityType: 'prospect',
    entityId: id,
    entityName: current.companyName,
    details: `eliminó el prospecto <strong>${current.companyName}</strong>`,
    ownerName: current.ownerName,
    organizationId: user.organizationId,
  });
}

export async function claimProspectOnServer(id: string, user: ServerUser): Promise<void> {
  const reference = prospectsCollection.doc(id);
  let prospectName = 'Prospecto';

  await dbAdmin.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data() || {};
    if (!snapshot.exists || !belongsToOrganization(data, user.organizationId)) {
      throw new ApiError(404, 'El prospecto no existe.', 'PROSPECT_NOT_FOUND');
    }

    const current = serializeProspect(snapshot.id, data);
    prospectName = current.companyName;
    if (current.ownerId) {
      throw new ApiError(409, 'El prospecto ya fue asignado a otro asesor.', 'PROSPECT_ALREADY_ASSIGNED');
    }
    if (current.claimStatus === 'Pendiente') {
      const message = current.claimantId === user.uid
        ? 'Tu reclamo ya está pendiente de aprobación.'
        : 'Otro asesor ya reclamó este prospecto.';
      throw new ApiError(409, message, 'PROSPECT_CLAIM_PENDING');
    }

    if (current.previousOwnerId === user.uid && current.unassignedAt) {
      const daysPassed = differenceInCalendarDays(new Date(), parseISO(current.unassignedAt));
      if (daysPassed < 3) {
        throw new ApiError(
          409,
          `Debes esperar ${3 - daysPassed} días más para volver a reclamar este prospecto.`,
          'PROSPECT_CLAIM_COOLDOWN',
        );
      }
    }

    transaction.update(reference, {
      claimStatus: 'Pendiente',
      claimantId: user.uid,
      claimantName: user.name,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'prospect',
    entityId: id,
    entityName: prospectName,
    details: `solicitó reclamar el prospecto <strong>${prospectName}</strong>`,
    ownerName: 'Sin Asignar',
    organizationId: user.organizationId,
  });
}

export async function resolveProspectClaimOnServer(
  id: string,
  decision: 'approve' | 'reject',
  user: ServerUser,
): Promise<void> {
  const snapshot = await getProspectSnapshot(id, user.organizationId);
  const current = serializeProspect(snapshot.id, snapshot.data() || {});
  if (!current.claimantId || !current.claimantName) {
    throw new ApiError(409, 'El prospecto no tiene un reclamo pendiente.', 'PROSPECT_CLAIM_NOT_FOUND');
  }

  const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    claimStatus: FieldValue.delete(),
    claimantId: FieldValue.delete(),
    claimantName: FieldValue.delete(),
    claimedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (decision === 'approve') {
    update.ownerId = current.claimantId;
    update.ownerName = current.claimantName;
    update.status = 'Nuevo';
    update.statusChangedAt = FieldValue.serverTimestamp();
  }

  await snapshot.ref.update(update);
  const action = decision === 'approve' ? 'aprobó' : 'rechazó';

  await logServerActivity({
    userId: user.uid,
    userName: user.name,
    type: 'update',
    entityType: 'prospect',
    entityId: id,
    entityName: current.companyName,
    details: `${action} el reclamo de <strong>${current.claimantName}</strong>`,
    ownerName: decision === 'approve' ? current.claimantName : 'Sin Asignar',
    organizationId: user.organizationId,
  });
}
