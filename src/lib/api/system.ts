'use client';

import { apiRequest } from '@/lib/api-client';
import type { AreaType, ScreenName, ScreenPermission } from '@/lib/types';

type PermissionsMap = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

export async function getAreaPermissions(): Promise<PermissionsMap> {
  const result = await apiRequest<{ permissions: PermissionsMap }>('/api/system/permissions', { method: 'GET' });
  return result.permissions;
}

export async function updateAreaPermissions(permissions: PermissionsMap): Promise<void> {
  await apiRequest<{ permissions: PermissionsMap }>('/api/system/permissions', {
    method: 'PUT',
    body: { permissions },
  });
}

export async function getEmailWhitelist(): Promise<string[]> {
  const result = await apiRequest<{ emails: string[] }>('/api/system/email-whitelist', { method: 'GET' });
  return result.emails;
}

export async function updateEmailWhitelist(emails: string[]): Promise<string[]> {
  const result = await apiRequest<{ emails: string[] }>('/api/system/email-whitelist', {
    method: 'PUT',
    body: { emails },
  });
  return result.emails;
}

export type WorkflowAssignments = {
  approvers: string[];
  billingReceptors: string[];
  tangoInvoicers: string[];
  needLoaders: string[];
  needRequestReceivers: string[];
  canjeRequestReceivers: string[];
  canjeManagementApprovers: string[];
  canjeCommercialReferents: string[];
};

export async function getWorkflowAssignments(): Promise<WorkflowAssignments> {
  const result = await apiRequest<{ assignments: WorkflowAssignments }>('/api/system/workflow-assignments', {
    method: 'GET',
  });
  return result.assignments;
}

export async function saveWorkflowAssignments(assignments: WorkflowAssignments): Promise<void> {
  await apiRequest<{ assignments: WorkflowAssignments }>('/api/system/workflow-assignments', {
    method: 'PUT',
    body: { assignments },
  });
}

