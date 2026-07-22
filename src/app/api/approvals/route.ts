import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { ApprovalHistoryItem, ApprovalStatus } from '@/lib/types';

const STATUSES_TO_FETCH: ApprovalStatus[] = ['Pendiente', 'Aprobado', 'Devuelto', 'Borrador', 'Pendiente de Modificación'];

const APPROVAL_COLLECTIONS = {
  commercial_notes: 'Nota Comercial',
  social_media_requests: 'Pedido de Redes',
  advertising_orders: 'Orden de Publicidad',
  web_notes: 'Nota Web / Gacetilla',
} as const;

type ApprovalCollectionName = keyof typeof APPROVAL_COLLECTIONS;
type ApprovalItemType = typeof APPROVAL_COLLECTIONS[ApprovalCollectionName];

function isReviewer(user: ServerUser): boolean {
  return hasServerManagementPrivileges(user) || user.area === 'Pautado';
}

function parseCreatedAt(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
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

async function loadCollectionApprovals(collectionName: ApprovalCollectionName, user: ServerUser) {
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
      status: rawData.status || 'Pendiente',
      adminComments: rawData.adminComments,
      collectionName,
      rawData,
      approvalHistory: rawData.approvalHistory || [],
    }];
  });
}

function isApprovalCollection(value: unknown): value is ApprovalCollectionName {
  return typeof value === 'string' && value in APPROVAL_COLLECTIONS;
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const approvals = (await Promise.all(
      (Object.keys(APPROVAL_COLLECTIONS) as ApprovalCollectionName[])
        .map(collectionName => loadCollectionApprovals(collectionName, requester)),
    ))
      .flat()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ approvals });
  } catch (error: any) {
    console.error('APPROVALS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar las aprobaciones.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const collectionName = body?.collectionName;
    const itemId = body?.itemId;
    const status = body?.status as ApprovalStatus | undefined;

    if (!isApprovalCollection(collectionName) || typeof itemId !== 'string' || !status) {
      return NextResponse.json({ error: 'Solicitud de aprobación inválida.' }, { status: 400 });
    }

    if (!['Aprobado', 'Devuelto'].includes(status)) {
      return NextResponse.json({ error: 'Estado de aprobación no soportado.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection(collectionName).doc(itemId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });
    }

    const data = snap.data() || {};
    if (!isReviewer(requester) && !isOwner(collectionName, data, requester.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const incomingHistory = body?.historyItem || {};
    const historyItem: ApprovalHistoryItem = {
      ...incomingHistory,
      status,
      userId: requester.uid,
      userName: requester.name || requester.email || 'Usuario',
      userRole: requester.role || incomingHistory.userRole || '',
    };

    await docRef.update({
      status,
      adminComments: body?.adminComments || '',
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: requester.uid,
      approvedByName: requester.name || requester.email || 'Usuario',
      approvalHistory: FieldValue.arrayUnion(historyItem),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('APPROVAL STATUS UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar la aprobacion.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
