import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ApprovalHistoryItem, ApprovalStatus } from '@/lib/types';

const PENDING_MODIFICATION_STATUS: ApprovalStatus = 'Pendiente de Modificación';
const LEGACY_PENDING_MODIFICATION_STATUS = 'Pendiente de Modificacion';
const CANONICAL_APPROVAL_STATUSES: ApprovalStatus[] = [
  'Pendiente',
  'Aprobado',
  'Devuelto',
  'Borrador',
  PENDING_MODIFICATION_STATUS,
];
const STATUSES_TO_FETCH = [
  ...CANONICAL_APPROVAL_STATUSES,
  LEGACY_PENDING_MODIFICATION_STATUS,
] as const;

export const APPROVAL_COLLECTIONS = {
  commercial_notes: 'Nota Comercial',
  social_media_requests: 'Pedido de Redes',
  advertising_orders: 'Orden de Publicidad',
  web_notes: 'Nota Web / Gacetilla',
} as const;

export type ApprovalCollectionName = keyof typeof APPROVAL_COLLECTIONS;
export type ApprovalItemType = typeof APPROVAL_COLLECTIONS[ApprovalCollectionName];

export type ApiApprovalItem = {
  id: string;
  type: ApprovalItemType;
  clientId: string;
  clientName: string;
  advisorName: string;
  title: string;
  createdAt: string;
  status: ApprovalStatus;
  adminComments?: string;
  collectionName: ApprovalCollectionName;
  rawData: Record<string, any>;
  approvalHistory?: ApprovalHistoryItem[];
};

export class ApprovalApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function isReviewer(user: ServerUser): boolean {
  return hasServerManagementPrivileges(user) || user.area === 'Pautado';
}

function parseCreatedAt(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function isOwner(collectionName: ApprovalCollectionName, data: Record<string, any>, userId: string): boolean {
  if (collectionName === 'advertising_orders') {
    return data.createdBy === userId || data.advisorId === userId;
  }
  return data.advisorId === userId;
}

function getApprovalTitle(type: ApprovalItemType, data: Record<string, any>): string {
  if (type === 'Nota Comercial') return data.title || 'Nota Sin Título';
  if (type === 'Pedido de Redes') return `${data.contentType} - ${data.objective || 'Sin objetivo'}`;
  if (type === 'Orden de Publicidad') return data.product || 'Publicidad Sin Título';
  return data.format || 'Nota Web';
}

function getAdvisorName(type: ApprovalItemType, data: Record<string, any>): string {
  return type === 'Orden de Publicidad' ? data.accountExecutive : data.advisorName;
}

function normalizeApprovalStatus(status: unknown): ApprovalStatus {
  if (status === LEGACY_PENDING_MODIFICATION_STATUS) return PENDING_MODIFICATION_STATUS;
  if (typeof status === 'string' && CANONICAL_APPROVAL_STATUSES.includes(status as ApprovalStatus)) {
    return status as ApprovalStatus;
  }
  return 'Pendiente';
}

function isApprovalCollection(value: unknown): value is ApprovalCollectionName {
  return typeof value === 'string' && value in APPROVAL_COLLECTIONS;
}

async function loadCollectionApprovals(
  collectionName: ApprovalCollectionName,
  user: ServerUser,
): Promise<ApiApprovalItem[]> {
  const snapshot = await dbAdmin
    .collection(collectionName)
    .where('status', 'in', STATUSES_TO_FETCH)
    .get();
  const reviewer = isReviewer(user);
  const type = APPROVAL_COLLECTIONS[collectionName];

  return snapshot.docs.flatMap(doc => {
    const rawData = serializeDocument<Record<string, any>>(doc.id, doc.data());
    if (!reviewer && !isOwner(collectionName, rawData, user.uid)) return [];

    return [{
      id: doc.id,
      type,
      clientId: rawData.clientId,
      clientName: rawData.clientName || 'Cliente',
      advisorName: getAdvisorName(type, rawData),
      title: getApprovalTitle(type, rawData),
      createdAt: parseCreatedAt(rawData.createdAt),
      status: normalizeApprovalStatus(rawData.status),
      adminComments: rawData.adminComments,
      collectionName,
      rawData,
      approvalHistory: rawData.approvalHistory || [],
    }];
  });
}

export async function listApprovalsServer(user: ServerUser): Promise<ApiApprovalItem[]> {
  return (await Promise.all(
    (Object.keys(APPROVAL_COLLECTIONS) as ApprovalCollectionName[])
      .map(collectionName => loadCollectionApprovals(collectionName, user)),
  ))
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function updateApprovalStatusServer(
  payload: {
    collectionName?: unknown;
    itemId?: unknown;
    status?: ApprovalStatus;
    adminComments?: string;
    historyItem?: Partial<ApprovalHistoryItem>;
  },
  requester: ServerUser,
): Promise<void> {
  const collectionName = payload.collectionName;
  const itemId = payload.itemId;
  const status = payload.status;

  if (!isApprovalCollection(collectionName) || typeof itemId !== 'string' || !status) {
    throw new ApprovalApiError('Solicitud de aprobación inválida.', 400);
  }

  if (!['Aprobado', 'Devuelto'].includes(status)) {
    throw new ApprovalApiError('Estado de aprobación no soportado.', 400);
  }

  const docRef = dbAdmin.collection(collectionName).doc(itemId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new ApprovalApiError('Documento no encontrado.', 404);
  }

  const data = snap.data() || {};
  if (!isReviewer(requester) && !isOwner(collectionName, data, requester.uid)) {
    throw new ApprovalApiError('Forbidden', 403);
  }

  const incomingHistory = payload.historyItem || {};
  const historyItem: ApprovalHistoryItem = {
    timestamp: incomingHistory.timestamp || new Date().toISOString(),
    status,
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    userRole: requester.role || incomingHistory.userRole || '',
    ...(incomingHistory.comments ? { comments: incomingHistory.comments } : {}),
  };

  await docRef.update({
    status,
    adminComments: payload.adminComments || '',
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: requester.uid,
    approvedByName: requester.name || requester.email || 'Usuario',
    approvalHistory: FieldValue.arrayUnion(historyItem),
  });
}
