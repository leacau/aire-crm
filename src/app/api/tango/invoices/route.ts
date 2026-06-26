import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

const DEFAULT_TANGO_BASE_URL = 'https://040896-002.connect.axoft.com';
const COMPANY_QUERIES: Record<string, { process: string; customQuery: string }> = {
  '4': { process: '17943', customQuery: '1235' }, // Aire (Avión)
  '5': { process: '17943', customQuery: '1235' }, // SRL
  '6': { process: '17943', customQuery: '1235' }, // SAS
};
const PAGE_SIZE = 2000;
const MAX_PAGES = 100;

type TangoInvoice = {
  FECHA_DE_EMISION?: string;
  TIPO_COMPROBANTE?: string;
  COD_TIPO_COMPROBANTE?: string;
  DESC_TIPO_COMPROBANTE?: string;
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
    const fetchPage = async (pageIndex: number) => {
      const tangoUrl = getTangoEndpoint();
      tangoUrl.searchParams.set('process', companyQuery.process);
      tangoUrl.searchParams.set('fromDate', '');
      tangoUrl.searchParams.set('toDate', '');
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

      return payload?.resultData || {};
    };

    const firstPage = await fetchPage(0);
    const firstPageItems = Array.isArray(firstPage.list) ? firstPage.list as TangoInvoice[] : [];
    invoices.push(...firstPageItems);
    const sourceTotalCount = Number(firstPage.totalCount) || firstPageItems.length;
    const reportedTotalPages = Math.max(1, Number(firstPage.totalPages) || Math.ceil(sourceTotalCount / PAGE_SIZE));
    const pageLimit = Math.min(reportedTotalPages, MAX_PAGES);
    const truncated = reportedTotalPages > MAX_PAGES;

    for (let pageStart = 1; pageStart < pageLimit; pageStart += 5) {
      const pageIndexes = Array.from(
        { length: Math.min(5, pageLimit - pageStart) },
        (_, index) => pageStart + index,
      );
      const pages = await Promise.all(pageIndexes.map(fetchPage));
      pages.forEach(page => {
        if (Array.isArray(page.list)) invoices.push(...page.list as TangoInvoice[]);
      });
    }

    const filtered = invoices.filter(invoice => {
      const issueDate = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
      const clientText = normalize(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
      const sellerText = normalize(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);
      return (!fromDate || issueDate >= fromDate)
        && (!toDate || issueDate <= toDate)
        && (!clientFilter || clientText.includes(clientFilter))
        && (!sellerFilter || sellerText.includes(sellerFilter));
    }).map((invoice: any) => {
      // 1. Procesar el TOTAL de forma nativa (JavaScript entiende el punto como decimal por defecto)
      let parsedTotal = null;
      if (invoice.TOTAL != null) {
        // Convierte "33333.330000" o 33333.33 directamente a número
        const numericTotal = Number(invoice.TOTAL);
        parsedTotal = isNaN(numericTotal) ? null : numericTotal;
      }

      return {
        ...invoice,
        TIPO_COMPROBANTE: invoice.TIPO_COMPROBANTE
          || invoice.DESC_TIPO_COMPROBANTE
          || invoice.COD_TIPO_COMPROBANTE
          || undefined,
        TOTAL: parsedTotal,
        COD_CLIENTE: invoice.COD_CLIENTE || invoice.CODIGO_CLIENTE || invoice.CLIENTE || '',
        COD_VENDEDOR: invoice.COD_VENDEDOR || invoice.COD_VEND || invoice.VENDEDOR || '',
        NOMBRE_VENDEDOR: invoice.NOMBRE_VENDEDOR || invoice.VENDEDOR_NOMBRE || invoice.NOMBRE_VEND || '',
      };
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
