import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';

const ALLOWED_COMPANIES = ['4', '5', '6'];
const DEFAULT_PDF_PROCESS = '14077';
const DEFAULT_PDF_ID_PAD_LENGTH = 7;
const INVOICE_NUMBER_SUFFIX_LENGTHS = [8, 7];
const PDF_SIGNATURE = '%PDF-';
const ERROR_PREVIEW_LENGTH = 600;
const BASE64_RESPONSE_KEYS = [
  'pdf',
  'file',
  'data',
  'content',
  'result',
  'resultData',
  'value',
  'base64',
  'archivo',
  'documento',
];

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

function parseCandidateList(value?: string) {
  return String(value || '')
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function getTangoPdfProcessCandidates(company: string) {
  const candidates = [
    ...parseCandidateList(process.env[`TANGO_INVOICE_PDF_PROCESS_${company}`]),
    ...parseCandidateList(process.env.TANGO_INVOICE_PDF_PROCESS),
    DEFAULT_PDF_PROCESS,
  ];

  return Array.from(new Set(candidates));
}

function addPaddedCandidate(candidates: Set<string>, value: string) {
  const cleanValue = value.trim();
  const padLength = Number(process.env.TANGO_INVOICE_PDF_ID_PAD_LENGTH || DEFAULT_PDF_ID_PAD_LENGTH);

  if (/^\d+$/.test(cleanValue) && Number.isInteger(padLength) && padLength > cleanValue.length) {
    candidates.add(cleanValue.padStart(padLength, '0'));
  }
}

function getInvoiceIdCandidates(invoiceId: string, invoiceNumber: string) {
  const cleanId = invoiceId.trim();
  const cleanInvoiceNumber = invoiceNumber.trim();
  const candidates = new Set([cleanId]);
  addPaddedCandidate(candidates, cleanId);

  const numericInvoiceNumber = cleanInvoiceNumber.replace(/\D/g, '');
  if (numericInvoiceNumber) {
    candidates.add(numericInvoiceNumber);
    INVOICE_NUMBER_SUFFIX_LENGTHS.forEach(length => {
      if (numericInvoiceNumber.length > length) {
        candidates.add(numericInvoiceNumber.slice(-length));
      }
    });
  }

  return Array.from(candidates).filter(Boolean);
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

function decodeBase64Pdf(value: string) {
  let candidate = value.trim();
  if (!candidate) return null;

  if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = candidate.slice(1, -1);
    }
  }

  const dataUriMatch = candidate.match(/^data:application\/pdf;base64,(.+)$/i);
  if (dataUriMatch?.[1]) {
    candidate = dataUriMatch[1];
  }

  candidate = candidate.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(candidate)) return null;

  const buffer = Buffer.from(candidate, 'base64');
  return isPdfBuffer(buffer) ? buffer : null;
}

function collectStringCandidates(value: unknown, candidates: string[] = [], depth = 0) {
  if (depth > 4 || value == null) return candidates;

  if (typeof value === 'string') {
    candidates.push(value);
    return candidates;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectStringCandidates(item, candidates, depth + 1));
    return candidates;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    BASE64_RESPONSE_KEYS.forEach(key => {
      const matchingKey = Object.keys(record).find(item => item.toLowerCase() === key.toLowerCase());
      if (matchingKey) collectStringCandidates(record[matchingKey], candidates, depth + 1);
    });
  }

  return candidates;
}

function extractPdfBuffer(body: Buffer, contentType: string) {
  if (isPdfBuffer(body)) return body;

  const text = body.toString('utf8').trim();
  const candidates = [text];
  const looksLikeJson = contentType.includes('json') || text.startsWith('{') || text.startsWith('[') || text.startsWith('"');

  if (looksLikeJson) {
    try {
      candidates.push(...collectStringCandidates(JSON.parse(text)));
    } catch {
      // Tango may still return plain base64 or an HTML/text error with a JSON-ish content type.
    }
  }

  for (const candidate of candidates) {
    const pdfBuffer = decodeBase64Pdf(candidate);
    if (pdfBuffer) return pdfBuffer;
  }

  if (looksLikeJson) {
    throw new Error(`Tango rechazo la descarga: ${getTangoErrorMessage(body)}`);
  }

  throw new Error(`Tango no devolvio un PDF valido. Respuesta: ${getTextPreview(body) || 'sin contenido'}`);
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
  const invoiceNumber = searchParams.get('number') || '';
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
    const processCandidates = getTangoPdfProcessCandidates(company);
    const idCandidates = getInvoiceIdCandidates(invoiceId, invoiceNumber);
    const errors: string[] = [];

    for (const processId of processCandidates) {
      for (const idCandidate of idCandidates) {
        const tangoUrl = getTangoPdfEndpoint();
        tangoUrl.searchParams.set('process', processId);
        tangoUrl.searchParams.set('id', idCandidate);

        const response = await fetch(tangoUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/pdf, application/json;q=0.9, text/plain;q=0.8, */*;q=0.7',
            ApiAuthorization: apiAuthorization,
            Company: company,
          },
          cache: 'no-store',
        });

        const contentType = response.headers.get('content-type') || 'application/pdf';
        const contentDisposition = response.headers.get('content-disposition');
        const body = Buffer.from(await response.arrayBuffer());

        if (!response.ok) {
          errors.push(`process ${processId}, id ${idCandidate}: Tango respondio ${response.status}: ${getTangoErrorMessage(body)}`);
          continue;
        }

        try {
          const pdfBuffer = extractPdfBuffer(body, contentType.toLowerCase());

          return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
              'Cache-Control': 'no-store',
              'Content-Type': 'application/pdf',
              'Content-Disposition': contentDisposition || `attachment; filename="${buildPdfFileName(company, idCandidate)}"`,
              'Content-Length': String(pdfBuffer.byteLength),
            },
          });
        } catch (error) {
          errors.push(`process ${processId}, id ${idCandidate}: ${error instanceof Error ? error.message : getTangoErrorMessage(body)}`);
        }
      }
    }

    throw new Error(`No se pudo obtener el PDF con procesos (${processCandidates.join(', ')}) e IDs (${idCandidates.join(', ')}). ${errors.join(' | ')}`);
  } catch (error) {
    console.error('Error downloading Tango invoice PDF:', error);
    return NextResponse.json({
      error: 'No se pudo descargar el PDF de Tango',
      details: error instanceof Error ? error.message : 'Error desconocido',
    }, { status: 502 });
  }
}
