import { describe, expect, it } from 'vitest';

import type { Opportunity } from './opportunity';
import { isOpportunityVisibleInActiveScope } from './opportunity-visibility';

const opportunity = (stage: Opportunity['stage'], createdAt: string): Opportunity => ({
  id: 'opportunity-1',
  title: 'Campaña',
  clientId: 'client-1',
  clientName: 'Cliente',
  value: 100,
  stage,
  closeDate: '2026-06-30',
  createdAt,
});

describe('opportunity active visibility', () => {
  const now = new Date('2026-06-24T12:00:00.000Z');

  it('keeps every non-lost stage visible', () => {
    expect(isOpportunityVisibleInActiveScope(opportunity('Nuevo', '2020-01-01T00:00:00.000Z'), now)).toBe(true);
  });

  it('keeps recently lost opportunities visible', () => {
    expect(isOpportunityVisibleInActiveScope(opportunity('Cerrado - Perdido', '2026-05-01T00:00:00.000Z'), now)).toBe(true);
  });

  it('hides lost opportunities older than three months', () => {
    expect(isOpportunityVisibleInActiveScope(opportunity('Cerrado - Perdido', '2025-12-01T00:00:00.000Z'), now)).toBe(false);
  });
});
