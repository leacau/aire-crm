import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';

const ALLOWED_COMPANIES = ['4', '5', '6'];
const DEFAULT_PDF_PROCESS = '14077';

const getTangoPdfEndpoint = () => {
  const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
  const cleanValue = configuredValue?.replace(/^["']|["']$/g, '');

  if (!cleanValue) {
    throw new Error('Falta configurar TANGO_API_BASE_URL');
  }

  try {
    const url = new URL(cleanValue);
    url.pathname = '/Api/GetPdf';
    url.search = '';
    return url;
  } catch {
    throw new Error('TANGO_API_BASE_URL no es una URL valida');
  }
};

function buildPdfFileName(company: string, invoiceId: string) {
  const cleanId = invoiceId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'factura';
  return `factura-tango-${company}-${cleanId}.pdf`;
}

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  if (!hasServerManagementPrivileges(serverUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get('company') || '';
  const invoiceId = searchParams.get('id') || '';
  const processId = process.env.TANGO_INVOICE_PDF_PROCESS?.trim() || DEFAULT_PDF_PROCESS;
  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;

  if (!ALLOWED_COMPANIES.includes(company)) {
    return NextResponse.json({ error: 'Company no permitida' }, { status: 400 });
  }

  if (!invoiceId.trim()) {
    return NextResponse.json({ error: 'Falta el ID de la factura.' }, { status: 400 });
  }

  if (!apiAuthorization) {
    return NextResponse.json({ error: 'Falta configurar TANGO_API_AUTHORIZATION' }, { status: 500 });
  }

  try {
    const tangoUrl = getTangoPdfEndpoint();
    tangoUrl.searchParams.set('process', processId);
    tangoUrl.searchParams.set('id', invoiceId.trim());

    const response = await fetch(tangoUrl, {
      method: 'GET',
      headers: {
        ApiAuthorization: apiAuthorization,
        Company: company,
      },
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentDisposition = response.headers.get('content-disposition');
    const body = await response.arrayBuffer();

    if (!response.ok) {
      const details = new TextDecoder().decode(body);
      throw new Error(`Tango respondio ${response.status}: ${details}`);
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': contentType.includes('application/pdf') ? contentType : 'application/pdf',
        'Content-Disposition': contentDisposition || `attachment; filename="${buildPdfFileName(company, invoiceId)}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading Tango invoice PDF:', error);
    return NextResponse.json({
      error: 'No se pudo descargar el PDF de Tango',
      details: error instanceof Error ? error.message : 'Error desconocido',
    }, { status: 502 });
  }
}
