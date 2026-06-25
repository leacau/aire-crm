import { describe, expect, it } from 'vitest';

import { crmModuleCatalog } from './catalog';
import { getEnabledModulesForPlatform, isModuleEnabled, resolveModules } from './resolve-modules';

const baseConfig = { organizationId: 'aire-de-santa-fe' };

describe('CRM module registry', () => {
  it('keeps every current module enabled by default', () => {
    const resolved = resolveModules(baseConfig);

    expect(resolved).toHaveLength(crmModuleCatalog.length);
    expect(resolved.every(module => module.enabled)).toBe(true);
  });

  it('allows an organization to disable an independent module', () => {
    const resolved = resolveModules({
      ...baseConfig,
      modules: { reporting: { enabled: false } },
    });

    expect(resolved.find(module => module.id === 'reporting')?.enabled).toBe(false);
    expect(isModuleEnabled({
      ...baseConfig,
      modules: { reporting: { enabled: false } },
    }, 'reporting')).toBe(false);
  });

  it('rejects configurations with a disabled required dependency', () => {
    expect(() => resolveModules({
      ...baseConfig,
      modules: { clients: { enabled: false } },
    })).toThrow('requiere que "clients" esté habilitado');
  });

  it('returns only modules available on the requested platform', () => {
    const androidModules = getEnabledModulesForPlatform(baseConfig, 'android');

    expect(androidModules.length).toBeGreaterThan(0);
    expect(androidModules.every(module => module.platforms.includes('android'))).toBe(true);
  });

  it('does not contain duplicate module or capability identifiers', () => {
    const moduleIds = crmModuleCatalog.map(module => module.id);
    const capabilities = crmModuleCatalog.flatMap(module => module.capabilities);

    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  it('marks only migrated modules as available through an API contract', () => {
    const apiModules = crmModuleCatalog.filter(module => module.apiVersion);
    expect(apiModules.map(module => module.id)).toEqual(['prospects']);
    expect(apiModules[0]?.apiVersion).toBe('v1');
  });
});
