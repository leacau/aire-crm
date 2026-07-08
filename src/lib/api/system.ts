'use client';

import { apiRequest } from '@/lib/api-client';
import type { AreaType, SasProductConfig, ScreenName, ScreenPermission } from '@/lib/types';

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

export async function getSrlAdTypes(): Promise<string[]> {
  const result = await apiRequest<{ types: string[] }>('/api/system/srl-ad-types', { method: 'GET' });
  return result.types;
}

export async function saveSrlAdTypes(types: string[]): Promise<string[]> {
  const result = await apiRequest<{ types: string[] }>('/api/system/srl-ad-types', {
    method: 'PUT',
    body: { types },
  });
  return result.types;
}

export async function getSasProducts(): Promise<SasProductConfig[]> {
  const result = await apiRequest<{ products: SasProductConfig[] }>('/api/system/sas-products', { method: 'GET' });
  return result.products;
}

export async function saveSasProducts(products: SasProductConfig[]): Promise<SasProductConfig[]> {
  const result = await apiRequest<{ products: SasProductConfig[] }>('/api/system/sas-products', {
    method: 'PUT',
    body: { products },
  });
  return result.products;
}

export async function getSystemHolidays(): Promise<string[]> {
  const result = await apiRequest<{ dates: string[] }>('/api/system/holidays', { method: 'GET' });
  return result.dates;
}

export async function saveSystemHolidays(dates: string[]): Promise<string[]> {
  const result = await apiRequest<{ dates: string[] }>('/api/system/holidays', {
    method: 'PUT',
    body: { dates },
  });
  return result.dates;
}
