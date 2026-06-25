import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/server/api-error';
import { listClientIdsForOrganization } from '@/modules/clients/server-index';
import type { Opportunity } from '../../domain/opportunity';
import { isOpportunityVisibleInActiveScope } from '../../domain/opportunity-visibility';

const opportunitiesCollection = dbAdmin.collection('opportunities');

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
  }
  return undefined;
}

function serializeOpportunity(id: string, data: FirebaseFirestore.DocumentData): Opportunity {
  return {
    ...data,
    id,
    createdAt: timestampToIso(data.createdAt) || new Date(0).toISOString(),
    updatedAt: timestampToIso(data.updatedAt),
    stageChangedAt: timestampToIso(data.stageChangedAt),
    manualUpdateDate: timestampToIso(data.manualUpdateDate),
    manualUpdateHistory: Array.isArray(data.manualUpdateHistory)
      ? data.manualUpdateHistory.map(timestampToIso).filter(Boolean)
      : [],
    closeDate: timestampToIso(data.closeDate)?.slice(0, 10) || data.closeDate || '',
  } as Opportunity;
}

function belongsToOrganization(
  data: FirebaseFirestore.DocumentData,
  organizationId: string,
  clientIds: Set<string>,
): boolean {
  if (data.organizationId) return data.organizationId === organizationId;
  if (data.clientId && clientIds.has(data.clientId)) return true;
  return organizationId === DEFAULT_ORGANIZATION_ID && !data.clientId;
}

export async function listOpportunitiesForOrganization(
  organizationId: string,
  scope: 'active' | 'all' = 'active',
  clientId?: string,
): Promise<Opportunity[]> {
  const clientIds = await listClientIdsForOrganization(organizationId);
  if (clientId && !clientIds.has(clientId)) {
    throw new ApiError(404, 'El cliente no existe.', 'CLIENT_NOT_FOUND');
  }

  const snapshot = clientId
    ? await opportunitiesCollection.where('clientId', '==', clientId).get()
    : await opportunitiesCollection.get();
  return snapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId, clientIds))
    .map(document => serializeOpportunity(document.id, document.data()))
    .filter(opportunity => {
      return scope === 'all' || isOpportunityVisibleInActiveScope(opportunity);
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function getOpportunityForOrganization(
  id: string,
  organizationId: string,
): Promise<Opportunity> {
  const [snapshot, clientIds] = await Promise.all([
    opportunitiesCollection.doc(id).get(),
    listClientIdsForOrganization(organizationId),
  ]);
  if (!snapshot.exists || !belongsToOrganization(snapshot.data() || {}, organizationId, clientIds)) {
    throw new ApiError(404, 'La oportunidad no existe.', 'OPPORTUNITY_NOT_FOUND');
  }
  return serializeOpportunity(snapshot.id, snapshot.data() || {});
}
