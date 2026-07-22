import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { tangoErrorResponse, tangoMissingConfigResponse } from '@/app/api/tango/utils';

const ALLOWED_COMPANIES = ['4', '5', '6'];
const DEFAULT_PDF_PROCESS = '14077';
const PDF_SIGNATURE = '%PDF-';
const ERROR_PREVIEW_LENGTH = 600;

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

function isPdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, PDF_SIGNATURE.length).toString('latin1') === PDF_SIGNATURE;
}

function getTextPreview(buffer: Buffer) {
  return buffer
    .toString('utf8')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ERROR_PREVIEW_LENGTH);
}

function extractPdfBuffer(body: Buffer) {
  if (isPdfBuffer(body)) return body;

  const text = body.toString('utf8').trim();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Tango no devolvio JSON ni PDF valido. Respuesta: ${getTextPreview(body) || 'sin contenido'}`);
  }

  if (payload?.succeeded === false) {
    throw new Error(`Tango rechazo la descarga: ${getTangoErrorMessage(body)}`);
  }

  const fileContents = payload?.fileResult?.fileContents;
  if (typeof fileContents !== 'string' || !fileContents.trim()) {
    throw new Error('Tango no informo fileResult.fileContents para el PDF.');
  }

  const pdfBuffer = Buffer.from(fileContents, 'base64');
  if (!isPdfBuffer(pdfBuffer)) {
    throw new Error('Tango informo fileResult.fileContents, pero el contenido no es un PDF valido.');
  }

  return pdfBuffer;
}

function getTangoErrorMessage(body: Buffer) {
  const text = getTextPreview(body);
  if (!text) return 'sin contenido';

  try {
    const payload = JSON.parse(body.toString('utf8'));
    const messages = Array.isArray(payload?.exceptionInfo?.messages)
      ? payload.exceptionInfo.messages.filter(Boolean).join(' ')
      : '';
    return messages || payload?.message || text;
  } catch {
    return text;
  }
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
    return tangoMissingConfigResponse('TANGO_API_AUTHORIZATION');
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

    const contentDisposition = response.headers.get('content-disposition');
    const body = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      throw new Error(`Tango respondio ${response.status}: ${getTangoErrorMessage(body)}`);
    }

    const pdfBuffer = extractPdfBuffer(body);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition || `attachment; filename="${buildPdfFileName(company, invoiceId)}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Error desconocido';
    const context = `process=${processId}, company=${company}, id=${invoiceId.trim()}`;
    return tangoErrorResponse(new Error(`${details} (${context})`), {
      action: 'INVOICE PDF DOWNLOAD',
      requesterId: serverUser.uid,
      publicError: 'No se pudo descargar el PDF de Tango',
    });
  }
}
