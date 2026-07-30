import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { hasServerScreenPermission } from '@/lib/server/screen-permissions';
import { downloadTangoInvoicePdfServer, TangoApiError } from '@/lib/server/tango';
import { tangoErrorResponse } from '@/app/api/tango/errors';

async function canDownloadTangoInvoicePdf(serverUser: Awaited<ReturnType<typeof requireServerUser>>) {
  if (isServerResponse(serverUser)) return false;
  if (hasServerManagementPrivileges(serverUser)) return true;
  if (serverUser.role === 'Asesor' || serverUser.area === 'Comercial') return true;
  return hasServerScreenPermission(serverUser, 'Invoices', 'view');
}

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  if (!(await canDownloadTangoInvoicePdf(serverUser))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get('company') || '';
  const invoiceId = searchParams.get('id') || '';

  try {
    const pdf = await downloadTangoInvoicePdfServer({ company, invoiceId });
    return new NextResponse(pdf.body, {
      status: 200,
      headers: pdf.headers,
    });
  } catch (error) {
    if (error instanceof TangoApiError) {
      return tangoErrorResponse(error, {
        action: 'INVOICE PDF DOWNLOAD',
        requesterId: serverUser.uid,
        publicError: 'No se pudo descargar el PDF de Tango',
      });
    }

    const details = error instanceof Error ? error.message : 'Error desconocido';
    return tangoErrorResponse(new Error(`${details} (company=${company}, id=${invoiceId.trim()})`), {
      action: 'INVOICE PDF DOWNLOAD',
      requesterId: serverUser.uid,
      publicError: 'No se pudo descargar el PDF de Tango',
    });
  }
}
