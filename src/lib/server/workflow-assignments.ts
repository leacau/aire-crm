import { dbAdmin } from '@/lib/firebase-admin';
import type { WorkflowAssignments } from '@/lib/api/system';

const WORKFLOW_ASSIGNMENTS_DOC_ID = 'workflow_assignments';

export const emptyWorkflowAssignments: WorkflowAssignments = {
  approvers: [],
  billingReceptors: [],
  tangoInvoicers: [],
  needLoaders: [],
  needRequestReceivers: [],
  canjeRequestReceivers: [],
  canjeManagementApprovers: [],
  canjeCommercialReferents: [],
};

export function normalizeWorkflowAssignments(data: Partial<WorkflowAssignments> | undefined): WorkflowAssignments {
  return {
    approvers: Array.isArray(data?.approvers) ? data.approvers : [],
    billingReceptors: Array.isArray(data?.billingReceptors) ? data.billingReceptors : [],
    tangoInvoicers: Array.isArray(data?.tangoInvoicers) ? data.tangoInvoicers : [],
    needLoaders: Array.isArray(data?.needLoaders) ? data.needLoaders : [],
    needRequestReceivers: Array.isArray(data?.needRequestReceivers) ? data.needRequestReceivers : [],
    canjeRequestReceivers: Array.isArray(data?.canjeRequestReceivers) ? data.canjeRequestReceivers : [],
    canjeManagementApprovers: Array.isArray(data?.canjeManagementApprovers) ? data.canjeManagementApprovers : [],
    canjeCommercialReferents: Array.isArray(data?.canjeCommercialReferents) ? data.canjeCommercialReferents : [],
  };
}

export async function getWorkflowAssignmentsServer(): Promise<WorkflowAssignments> {
  const snap = await dbAdmin.collection('system_config').doc(WORKFLOW_ASSIGNMENTS_DOC_ID).get();
  return snap.exists
    ? normalizeWorkflowAssignments(snap.data() as Partial<WorkflowAssignments>)
    : emptyWorkflowAssignments;
}

export async function saveWorkflowAssignmentsServer(assignments: WorkflowAssignments): Promise<void> {
  await dbAdmin.collection('system_config').doc(WORKFLOW_ASSIGNMENTS_DOC_ID).set(assignments, { merge: true });
}
