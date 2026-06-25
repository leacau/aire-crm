import { describe, expect, it } from 'vitest';

import { createProspectSchema, updateProspectSchema } from './prospect-schemas';

describe('Prospect API contracts', () => {
  it('normalizes a valid create request and supplies the initial status', () => {
    const input = createProspectSchema.parse({ companyName: '  Empresa Demo  ' });
    expect(input.companyName).toBe('Empresa Demo');
    expect(input.status).toBe('Nuevo');
  });

  it('does not allow clients to choose organization or owner on create', () => {
    const result = createProspectSchema.safeParse({
      companyName: 'Empresa Demo',
      organizationId: 'otra-organizacion',
      ownerId: 'otro-usuario',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status and malformed email values', () => {
    expect(createProspectSchema.safeParse({ companyName: 'Demo', status: 'Inventado' }).success).toBe(false);
    expect(createProspectSchema.safeParse({ companyName: 'Demo', contactEmail: 'no-es-email' }).success).toBe(false);
  });

  it('requires at least one field on update', () => {
    expect(updateProspectSchema.safeParse({}).success).toBe(false);
    expect(updateProspectSchema.safeParse({ status: 'Contactado' }).success).toBe(true);
  });

  it('accepts clearing a pending claim during a management assignment', () => {
    expect(updateProspectSchema.safeParse({
      ownerId: 'advisor-2',
      ownerName: 'Asesor Dos',
      claimStatus: null,
      claimantId: null,
      claimantName: null,
      claimedAt: null,
      unassignedAt: null,
    }).success).toBe(true);
  });
});
