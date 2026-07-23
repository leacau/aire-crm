import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { listApprovalsServer, updateApprovalStatusServer } from '@/lib/server/approvals';
import { approvalErrorResponse } from '@/app/api/approvals/errors';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const approvals = await listApprovalsServer(requester);
    return NextResponse.json({ approvals });
  } catch (error) {
    return approvalErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las aprobaciones.',
    });
  }
}

export async function PATCH(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await updateApprovalStatusServer(body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return approvalErrorResponse(error, {
      action: 'STATUS UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la aprobacion.',
    });
  }
}
