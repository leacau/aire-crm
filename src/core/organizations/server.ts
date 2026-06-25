import { crmModuleIds } from '@/core/modules';
import type { CrmModuleId, OrganizationModuleConfig } from '@/core/modules';
import { dbAdmin } from '@/lib/firebase-admin';

export async function getOrganizationModuleConfig(
  organizationId: string,
): Promise<OrganizationModuleConfig> {
  const snapshot = await dbAdmin.collection('organizations').doc(organizationId).get();
  const rawModules = snapshot.exists ? snapshot.data()?.modules : undefined;
  return resolveOrganizationModuleConfig(organizationId, rawModules);
}

export function resolveOrganizationModuleConfig(
  organizationId: string,
  rawModules: unknown,
): OrganizationModuleConfig {
  const modules: OrganizationModuleConfig['modules'] = {};

  if (rawModules && typeof rawModules === 'object') {
    for (const moduleId of crmModuleIds) {
      const value = (rawModules as Partial<Record<CrmModuleId, unknown>>)[moduleId];
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as { enabled?: unknown }).enabled === 'boolean'
      ) {
        modules[moduleId] = { enabled: (value as { enabled: boolean }).enabled };
      }
    }
  }

  return {
    organizationId,
    modules: Object.keys(modules).length > 0 ? modules : undefined,
  };
}
