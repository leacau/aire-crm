import { crmModuleCatalog } from './catalog';
import type {
  CrmModuleDefinition,
  CrmModuleId,
  CrmPlatform,
  OrganizationModuleConfig,
  ResolvedCrmModule,
} from './types';

export function resolveModules(
  config: OrganizationModuleConfig,
  catalog: readonly CrmModuleDefinition[] = crmModuleCatalog,
): ResolvedCrmModule[] {
  const resolved = catalog.map(definition => ({
    ...definition,
    enabled: config.modules?.[definition.id]?.enabled ?? definition.defaultEnabled,
  }));

  const enabledById = new Map(resolved.map(definition => [definition.id, definition.enabled]));

  for (const definition of resolved) {
    if (!definition.enabled) continue;

    for (const dependencyId of definition.dependencies) {
      if (!enabledById.get(dependencyId)) {
        throw new Error(
          `El módulo "${definition.id}" requiere que "${dependencyId}" esté habilitado.`,
        );
      }
    }
  }

  return resolved;
}

export function getEnabledModulesForPlatform(
  config: OrganizationModuleConfig,
  platform: CrmPlatform,
  catalog: readonly CrmModuleDefinition[] = crmModuleCatalog,
): ResolvedCrmModule[] {
  return resolveModules(config, catalog).filter(
    definition => definition.enabled && definition.platforms.includes(platform),
  );
}

export function isModuleEnabled(
  config: OrganizationModuleConfig,
  moduleId: CrmModuleId,
  catalog: readonly CrmModuleDefinition[] = crmModuleCatalog,
): boolean {
  return resolveModules(config, catalog).some(
    definition => definition.id === moduleId && definition.enabled,
  );
}
