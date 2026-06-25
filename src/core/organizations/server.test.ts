import { describe, expect, it } from 'vitest';

import { resolveOrganizationModuleConfig } from './server';

describe('organization module configuration', () => {
  it('uses catalog defaults when the organization has no overrides', () => {
    expect(resolveOrganizationModuleConfig('aire', undefined)).toEqual({
      organizationId: 'aire',
      modules: undefined,
    });
  });

  it('keeps valid overrides and ignores unknown or malformed entries', () => {
    expect(resolveOrganizationModuleConfig('aire', {
      prospects: { enabled: true },
      reporting: { enabled: false },
      clients: { enabled: 'yes' },
      unknown: { enabled: true },
    })).toEqual({
      organizationId: 'aire',
      modules: {
        prospects: { enabled: true },
        reporting: { enabled: false },
      },
    });
  });
});
