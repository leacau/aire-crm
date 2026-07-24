import { NextResponse } from 'next/server';
import { invoiceErrorResponse } from '@/app/api/invoices/errors';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { createInvoiceServer, listInvoicesServer } from '@/lib/server/invoices';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({
      invoices: await listInvoicesServer({
        opportunityId: searchParams.get('opportunityId'),
        dashboard: searchParams.get('dashboard') === 'true',
        requester,
      }),
    });
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar las facturas.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createInvoiceServer(body, requester) });
  } catch (error) {
    return invoiceErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la factura.',
    });
  }
}
