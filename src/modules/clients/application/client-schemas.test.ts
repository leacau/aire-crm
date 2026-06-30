import { describe, expect, it } from 'vitest';

import {
  createClientSchema,
  createPersonSchema,
  updateClientSchema,
  updatePersonSchema,
} from './client-schemas';

describe('Client API contracts', () => {
  it('normalizes a minimal client and supplies safe defaults', () => {
    const client = createClientSchema.parse({ denominacion: '  Empresa Demo  ' });
    expect(client.denominacion).toBe('Empresa Demo');
    expect(client.condicionIVA).toBe('Consumidor Final');
    expect(client.tipoEntidad).toBe('Privada');
  });

  it('accepts legacy empty client fields from existing forms', () => {
    const client = createClientSchema.parse({
      denominacion: 'Empresa Demo',
      tipoEntidad: 'PÃºblica',
      agencyId: null,
      razonSocialTango: null,
      email: null,
    });
    expect(client.tipoEntidad).toBe('Pública');
    expect(client.agencyId).toBeUndefined();
    expect(client.email).toBe('');
  });

  it('rejects organization and audit fields supplied by a client', () => {
    expect(createClientSchema.safeParse({
      denominacion: 'Demo',
      organizationId: 'otra',
      createdAt: '2026-01-01T00:00:00.000Z',
    }).success).toBe(false);
  });

  it('requires at least one update field', () => {
    expect(updateClientSchema.safeParse({}).success).toBe(false);
    expect(updateClientSchema.safeParse({ needsAttention: true }).success).toBe(true);
  });

  it('validates person names and updates', () => {
    expect(createPersonSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createPersonSchema.safeParse({ name: 'Contacto', email: 'contacto@example.com' }).success).toBe(true);
    expect(updatePersonSchema.safeParse({}).success).toBe(false);
  });
});
