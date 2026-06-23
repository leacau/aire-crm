import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

const DEFAULT_TANGO_BASE_URL = 'https://040896-002.connect.axoft.com';
const COMPANY_QUERIES: Record<string, { process: string; customQuery: string }> = {
  '5': { process: '17942', customQuery: '0' },
  '6': { process: '17943', customQuery: '1233' },
};
const PAGE_SIZE = 500;
const MAX_PAGES = 100;

type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  NRO_COMPROBANTE?: string;
  COD_VENDEDOR?: string;
  NOMBRE_VENDEDOR?: string;
  COD_CLIENTE?: string;
  RAZON_SOCIAL?: string;
  ID_GVA14?: number | null;
  TOTAL?: number | null;
  ID_GVA12?: number | null;
  ID_GVA23?: number | null;
  ID_GVA38?: number | null;
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getTangoEndpoint = () => {
  const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
  const cleanValue = configuredValue?.replace(/^["']|["']$/g, '') || DEFAULT_TANGO_BASE_URL;

  try {
    const url = new URL(cleanValue);
    url.pathname = '/Api/GetApiLiveQueryData';
    url.search = '';
    return url;
  } catch {
    console.warn('TANGO_API_BASE_URL is invalid; using Tango Connect default URL.');
    return new URL('/Api/GetApiLiveQueryData', DEFAULT_TANGO_BASE_URL);
  }
};

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  const { searchParams } = new URL(request.url);
  const company = searchParams.get('company') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const clientFilter = normalize(searchParams.get('client'));
  const sellerFilter = normalize(searchParams.get('seller'));

  const companyQuery = COMPANY_QUERIES[company];
  if (!companyQuery) {
    return NextResponse.json({ error: 'Company no permitida' }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: 'El rango de fechas no es valido' }, { status: 400 });
  }

  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;
  if (!apiAuthorization) {
    return NextResponse.json({ error: 'Falta configurar TANGO_API_AUTHORIZATION' }, { status: 500 });
  }

  try {
    const invoices: TangoInvoice[] = [];
    let sourceTotalCount = 0;
    let truncated = false;

    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      const tangoUrl = getTangoEndpoint();
      tangoUrl.searchParams.set('process', companyQuery.process);
      tangoUrl.searchParams.set('fromDate', fromDate);
      tangoUrl.searchParams.set('toDate', toDate);
      tangoUrl.searchParams.set('pageSize', String(PAGE_SIZE));
      tangoUrl.searchParams.set('pageIndex', String(pageIndex));
      tangoUrl.searchParams.set('customQuery', companyQuery.customQuery);

      const response = await fetch(tangoUrl, {
        method: 'GET',
        headers: {
          ApiAuthorization: apiAuthorization,
          Company: company,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Tango respondio ${response.status}: ${details}`);
      }

      const payload = await response.json();
      if (payload?.succeeded === false) {
        throw new Error(payload?.message || payload?.exceptionInfo || 'Tango rechazo la consulta');
      }

      const resultData = payload?.resultData || {};
      const pageItems = Array.isArray(resultData.list) ? resultData.list as TangoInvoice[] : [];
      invoices.push(...pageItems);
      sourceTotalCount = Number(resultData.totalCount) || invoices.length;

      if (!resultData.hasNextPage || pageItems.length === 0) break;
      if (pageIndex === MAX_PAGES - 1) truncated = true;
    }

    const filtered = invoices.filter(invoice => {
      const clientText = normalize(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
      const sellerText = normalize(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);
      return (!clientFilter || clientText.includes(clientFilter))
        && (!sellerFilter || sellerText.includes(sellerFilter));
    });

    return NextResponse.json({
      list: filtered,
      sourceTotalCount,
      filteredCount: filtered.length,
      truncated,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error consulting Tango invoices:', error);
    return NextResponse.json({
      error: 'No se pudieron consultar las facturas de Tango',
      details: error instanceof Error ? error.message : 'Error desconocido',
    }, { status: 502 });
  }
}
