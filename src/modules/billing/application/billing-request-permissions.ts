import type { BillingRequestStatus, BillingRequestWithMetadata } from '../domain/billing-request';

export type BillingActor = {
  uid: string;
  isBillingReceptor: boolean;
  isManager: boolean;
};

export function canSeeBillingRequest(actor: BillingActor, request: BillingRequestWithMetadata): boolean {
  return actor.isManager || actor.isBillingReceptor || request.advisorId === actor.uid;
}

export function canTransitionBillingRequest(
  actor: BillingActor,
  request: BillingRequestWithMetadata,
  status: BillingRequestStatus,
): boolean {
  if (actor.isManager) return true;
  if (status === 'Solicitado') return request.advisorId === actor.uid;
  if (status === 'Elevado' || status === 'Confeccionado') return actor.isBillingReceptor;
  if (status === 'Sugerido') return actor.isBillingReceptor;
  return false;
}
