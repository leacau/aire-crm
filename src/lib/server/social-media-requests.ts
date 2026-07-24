import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/lib/server/requester';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import {
  canAccessAdvisorScopedRecord,
  canAssignAdvisorScopedOwner,
  changesAdvisorScopedOwner,
  filterAccessibleAdvisorScopedRecords,
} from '@/lib/server/advisor-scoped-access';
import type { SocialMediaRequest } from '@/lib/types';

export class SocialMediaRequestApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function mapSocialMediaRequest(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): SocialMediaRequest {
  return serializeDocument<SocialMediaRequest>(id, data);
}

export function compareSocialMediaRequestsByCreatedAtDesc(a: SocialMediaRequest, b: SocialMediaRequest) {
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function cleanSocialMediaPayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined),
  ) as Partial<T>;
}

export function buildSocialMediaUpdatePayload(data: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    ...cleanSocialMediaPayload(data),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.contentType === 'Reel') {
    updateData.isWebReplication = FieldValue.delete();
    updateData.storyUrl = FieldValue.delete();
    updateData.storyCta = FieldValue.delete();
    updateData.storyTagClient = FieldValue.delete();
    updateData.storyTagHandle = FieldValue.delete();
    updateData.carouselSlides = FieldValue.delete();
  } else if (data.contentType === 'Story') {
    updateData.reelCopy = FieldValue.delete();
    updateData.reelCollaboration = FieldValue.delete();
    updateData.reelCollabHandle = FieldValue.delete();
    updateData.carouselSlides = FieldValue.delete();
  } else if (data.contentType === 'Carrusel') {
    updateData.isWebReplication = FieldValue.delete();
    updateData.storyUrl = FieldValue.delete();
    updateData.storyCta = FieldValue.delete();
    updateData.storyTagClient = FieldValue.delete();
    updateData.storyTagHandle = FieldValue.delete();
    updateData.reelCopy = FieldValue.delete();
  }

  return updateData;
}

async function getFilteredRequests(field?: string, value?: string): Promise<SocialMediaRequest[]> {
  const collectionRef = dbAdmin.collection('social_media_requests');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapSocialMediaRequest(doc.id, doc.data()))
    .sort(compareSocialMediaRequestsByCreatedAtDesc);
}

export async function listSocialMediaRequestsServer(options: {
  clientId?: string | null;
  orderId?: string | null;
}, requester: ServerUser) {
  let requests: SocialMediaRequest[];
  if (options.clientId) {
    requests = await getFilteredRequests('clientId', options.clientId);
  } else if (options.orderId) {
    requests = await getFilteredRequests('orderId', options.orderId);
  } else {
    requests = await getFilteredRequests();
  }

  return filterAccessibleAdvisorScopedRecords(requests, requester);
}

export async function createSocialMediaRequestServer(rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const requestData = body.requestData as Omit<SocialMediaRequest, 'id' | 'createdAt'> | undefined;

  if (!requestData?.clientId || !requestData.clientName || !requestData.contentType) {
    throw new SocialMediaRequestApiError('Cliente y tipo de contenido son obligatorios.', 400);
  }

  const requesterName = getRequesterName(requester);
  const advisorId = canAssignAdvisorScopedOwner(requester) && requestData.advisorId
    ? requestData.advisorId
    : requester.uid;
  const advisorName = canAssignAdvisorScopedOwner(requester) && requestData.advisorName
    ? requestData.advisorName
    : requesterName;
  const dataToSave = {
    ...cleanSocialMediaPayload(requestData as unknown as Record<string, unknown>),
    advisorId,
    advisorName,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await dbAdmin.collection('social_media_requests').add(dataToSave);

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'create',
    entityType: 'social_media_request',
    entityId: docRef.id,
    entityName: requestData.clientName,
    details: `creo un pedido de redes para <strong>${requestData.clientName}</strong> (${requestData.contentType})`,
    ownerName: advisorName,
  });

  return docRef.id;
}

export async function getSocialMediaRequestServer(requestId: string, requester: ServerUser) {
  const snap = await dbAdmin.collection('social_media_requests').doc(requestId).get();
  if (!snap.exists) return null;

  const requestData = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(requestData, requester))) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  return requestData;
}

export async function updateSocialMediaRequestServer(requestId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const data = (body.data || {}) as Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>;
  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new SocialMediaRequestApiError('Pedido no encontrado', 404);
  }

  const originalData = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(originalData, requester))) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  if (!canAssignAdvisorScopedOwner(requester) && changesAdvisorScopedOwner(data, originalData)) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  const updateData = buildSocialMediaUpdatePayload(data as Record<string, unknown>);

  if (Array.isArray(data.approvalHistory)) {
    delete updateData.approvalHistory;
    if (data.approvalHistory.length > 0) {
      updateData.approvalHistory = FieldValue.arrayUnion(...data.approvalHistory);
    }
  }

  await docRef.update(updateData);

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request',
    entityId: requestId,
    entityName: data.clientName || originalData.clientName,
    details: `actualizo un pedido de redes de <strong>${data.clientName || originalData.clientName}</strong>`,
    ownerName: data.advisorName || originalData.advisorName,
  });
}

export async function deleteSocialMediaRequestServer(requestId: string, requester: ServerUser) {
  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();

  if (!snap.exists) return;

  if (!hasServerManagementPrivileges(requester)) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  const data = snap.data() || {};
  await docRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'social_media_request',
    entityId: requestId,
    entityName: data.clientName || 'Pedido de redes',
    details: `elimino un pedido de redes de <strong>${data.clientName || 'Cliente'}</strong>`,
    ownerName: data.advisorName || requesterName,
  });
}

export async function linkSocialMediaRequestOrderServer(requestId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const orderTitle = typeof body.orderTitle === 'string' ? body.orderTitle.trim() : '';

  if (!orderId || !orderTitle) {
    throw new SocialMediaRequestApiError('Orden obligatoria para vincular el pedido.', 400);
  }

  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new SocialMediaRequestApiError('Pedido no encontrado', 404);
  }

  const socialRequest = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(socialRequest, requester))) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  await docRef.update({
    orderId,
    orderTitle,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request',
    entityId: requestId,
    entityName: 'Pedido de Redes',
    details: `vinculo un pedido de redes a la orden <strong>${orderTitle}</strong>`,
    ownerName: requesterName,
  });
}

export async function unlinkSocialMediaRequestOrderServer(requestId: string, rawBody: unknown, requester: ServerUser) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!reason) {
    throw new SocialMediaRequestApiError('Debe indicar el motivo de la desvinculacion.', 400);
  }

  const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new SocialMediaRequestApiError('Pedido no encontrado', 404);
  }

  const socialRequest = mapSocialMediaRequest(snap.id, snap.data());
  if (!(await canAccessAdvisorScopedRecord(socialRequest, requester))) {
    throw new SocialMediaRequestApiError('Forbidden', 403);
  }

  const requesterName = getRequesterName(requester);
  await docRef.update({
    orderId: FieldValue.delete(),
    orderTitle: FieldValue.delete(),
    orderUnlinkedAt: FieldValue.serverTimestamp(),
    orderUnlinkedById: requester.uid,
    orderUnlinkedByName: requesterName,
    orderUnlinkReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'update',
    entityType: 'social_media_request',
    entityId: requestId,
    entityName: 'Pedido de Redes',
    details: 'quito la vinculacion de un pedido de redes con una orden de publicidad',
    ownerName: requesterName,
  });
}
