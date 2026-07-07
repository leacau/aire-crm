'use client';

import { apiRequest } from '@/lib/api-client';
import type { ApprovalHistoryItem, ApprovalStatus } from '@/lib/types';

export type ApprovalItemType = 'Nota Comercial' | 'Pedido de Redes' | 'Orden de Publicidad' | 'Nota Web / Gacetilla';

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
  collectionName: string;
  rawData: any;
  approvalHistory?: ApprovalHistoryItem[];
};

export async function getApprovals(): Promise<ApiApprovalItem[]> {
  const result = await apiRequest<{ approvals: ApiApprovalItem[] }>('/api/approvals', { method: 'GET' });
  return result.approvals;
}

export async function updateApprovalStatus(payload: {
  collectionName: string;
  itemId: string;
  status: 'Aprobado' | 'Devuelto';
  adminComments?: string;
  historyItem?: Partial<ApprovalHistoryItem>;
}): Promise<void> {
  await apiRequest<{ ok: true }>('/api/approvals', {
    method: 'PATCH',
    body: payload,
  });
}
