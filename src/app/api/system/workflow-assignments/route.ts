import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import type { WorkflowAssignments } from '@/lib/api/system';

const WORKFLOW_ASSIGNMENTS_DOC_ID = 'workflow_assignments';

const emptyAssignments: WorkflowAssignments = {
  approvers: [],
  billingReceptors: [],
  tangoInvoicers: [],
  needLoaders: [],
  needRequestReceivers: [],
  canjeRequestReceivers: [],
  canjeManagementApprovers: [],
  canjeCommercialReferents: [],
};

function normalizeAssignments(data: Partial<WorkflowAssignments> | undefined): WorkflowAssignments {
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

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snap = await dbAdmin.collection('system_config').doc(WORKFLOW_ASSIGNMENTS_DOC_ID).get();
  const assignments = snap.exists ? normalizeAssignments(snap.data() as Partial<WorkflowAssignments>) : emptyAssignments;

  return NextResponse.json({ assignments });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const assignments = normalizeAssignments(body?.assignments);

  await dbAdmin.collection('system_config').doc(WORKFLOW_ASSIGNMENTS_DOC_ID).set(assignments, { merge: true });

  return NextResponse.json({ assignments });
}

