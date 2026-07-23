import { NextResponse } from 'next/server';
import { paymentErrorResponse } from '@/app/api/payments/errors';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { deletePaymentsServer, importPaymentsServer, listPaymentsServer } from '@/lib/server/payments';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({ payments: await listPaymentsServer({ pending: searchParams.get('pending') === 'true' }) });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los pagos.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    await importPaymentsServer(body, requester);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'IMPORT',
      requesterId: requester.uid,
      publicError: 'No se pudieron importar los pagos.',
    });
  }
}

export async function DELETE(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json().catch(() => null);
    await deletePaymentsServer(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentErrorResponse(error, {
      action: 'DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudieron eliminar los pagos.',
    });
  }
}
