import { NextResponse } from 'next/server';
import { invoiceErrorResponse } from '@/app/api/invoices/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { deleteInvoiceServer, updateInvoiceServer } from '@/lib/server/invoices';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { invoiceId } = await context.params;
    const body = await request.json();
    await updateInvoiceServer(invoiceId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar la factura.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { invoiceId } = await context.params;
    const body = await request.json().catch(() => null);
    await deleteInvoiceServer(invoiceId, body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo eliminar la factura.',
    });
  }
}
