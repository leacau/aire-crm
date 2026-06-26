import { describe, expect, it } from 'vitest';

import { canSeeBillingRequest, canTransitionBillingRequest } from './billing-request-permissions';
import type { BillingRequestWithMetadata } from '../domain/billing-request';

const request: BillingRequestWithMetadata = {
  id: 'request-1',
  advisorId: 'advisor-1',
  accountExecutive: 'Asesor',
  opportunityTitle: 'Campaña',
  clientDisplayName: 'Cliente',
  cuit: '20-00000000-0',
  billingStatus: 'Sugerido',
};

describe('billing request permissions', () => {
  it('lets advisors see and request their own suggested invoices', () => {
    const actor = { uid: 'advisor-1', isBillingReceptor: false, isManager: false };

    expect(canSeeBillingRequest(actor, request)).toBe(true);
    expect(canTransitionBillingRequest(actor, request, 'Solicitado')).toBe(true);
  });

  it('does not let advisors elevate or settle invoices', () => {
    const actor = { uid: 'advisor-1', isBillingReceptor: false, isManager: false };

    expect(canTransitionBillingRequest(actor, request, 'Elevado')).toBe(false);
    expect(canTransitionBillingRequest(actor, request, 'Confeccionado')).toBe(false);
  });

  it('lets billing receptors operate every queue item', () => {
    const actor = { uid: 'receptor-1', isBillingReceptor: true, isManager: false };

    expect(canSeeBillingRequest(actor, request)).toBe(true);
    expect(canTransitionBillingRequest(actor, request, 'Elevado')).toBe(true);
    expect(canTransitionBillingRequest(actor, request, 'Confeccionado')).toBe(true);
  });
});
