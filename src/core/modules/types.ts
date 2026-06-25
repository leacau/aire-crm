export const crmModuleIds = [
  'dashboard',
  'clients',
  'opportunities',
  'prospects',
  'objectives',
  'tasks',
  'coaching',
  'programming',
  'advertising',
  'content',
  'approvals',
  'calendar',
  'billing',
  'exchanges',
  'human-resources',
  'reporting',
  'administration',
  'integrations',
] as const;

export type CrmModuleId = (typeof crmModuleIds)[number];

export type CrmPlatform = 'web' | 'android';

export type CapabilityAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'manage'
  | 'import'
  | 'export';

export type ModuleCapability = `${CrmModuleId}.${CapabilityAction}`;

export interface CrmModuleDefinition {
  id: CrmModuleId;
  name: string;
  description: string;
  version: string;
  defaultEnabled: boolean;
  dependencies: readonly CrmModuleId[];
  platforms: readonly CrmPlatform[];
  capabilities: readonly ModuleCapability[];
  apiVersion?: 'v1';
}

export interface OrganizationModuleConfig {
  organizationId: string;
  modules?: Partial<Record<CrmModuleId, { enabled: boolean }>>;
}

export interface ResolvedCrmModule extends CrmModuleDefinition {
  enabled: boolean;
}
