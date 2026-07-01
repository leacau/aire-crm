import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

const DEFAULT_TANGO_BASE_URL = 'https://040896-002.connect.axoft.com';
const PAGE_SIZE = 2000;
const PAGE_BATCH_SIZE = 5;
const MAX_PAGES = 100;

type CompanyQuery = {
  process?: string;
  customQuery?: string;
  label: string;
};

const COMPANY_QUERIES: Record<string, CompanyQuery> = {
  '4': {
    label: 'Aire',
    process: process.env.TANGO_AIRE_INVOICES_PROCESS,
    customQuery: process.env.TANGO_AIRE_INVOICES_QUERY,
  },
  '5': {
    label: 'Aire SRL',
    process: process.env.TANGO_SRL_INVOICES_PROCESS || '17942',
    customQuery: process.env.TANGO_SRL_INVOICES_QUERY || '0',
  },
  '6': {
    label: 'Aire Digital SAS',
    process: process.env.TANGO_SAS_INVOICES_PROCESS || '17943',
    customQuery: process.env.TANGO_SAS_INVOICES_QUERY || '1233',
  },
};

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
  TOTAL?: number | string | null;
  ID_GVA14?: number | null;
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
    return new URL('/Api/GetApiLiveQueryData', DEFAULT_TANGO_BASE_URL);
  }
};

const normalizeInvoice = (invoice: Record<string, any>): TangoInvoice => {
  const numericTotal = invoice.TOTAL == null ? null : Number(invoice.TOTAL);

  return {
    ...invoice,
    FECHA_DE_EMISION: invoice.FECHA_DE_EMISION || invoice.FECHA_EMISION || invoice.FECHA || '',
    TIPO_COMPROBANTE: invoice.TIPO_COMPROBANTE
      || invoice.DESC_TIPO_COMPROBANTE
      || invoice.COD_TIPO_COMPROBANTE
      || invoice.TIPO
      || undefined,
    TOTAL: Number.isFinite(numericTotal) ? numericTotal : null,
    COD_CLIENTE: invoice.COD_CLIENTE || invoice.CODIGO_CLIENTE || invoice.CLIENTE || '',
    COD_VENDEDOR: invoice.COD_VENDEDOR || invoice.COD_VEND || invoice.VENDEDOR || '',
    NOMBRE_VENDEDOR: invoice.NOMBRE_VENDEDOR || invoice.VENDEDOR_NOMBRE || invoice.NOMBRE_VEND || '',
  };
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
  if (!companyQuery.process || companyQuery.customQuery == null) {
    return NextResponse.json({
      list: [],
      sourceTotalCount: 0,
      filteredCount: 0,
      skipped: true,
      message: `La consulta de comprobantes de ${companyQuery.label} no esta configurada.`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;
  if (!apiAuthorization) {
    return NextResponse.json({ error: 'Falta configurar TANGO_API_AUTHORIZATION' }, { status: 500 });
  }

  try {
    const fetchPage = async (pageIndex: number) => {
      const tangoUrl = getTangoEndpoint();
      tangoUrl.searchParams.set('process', companyQuery.process!);
      tangoUrl.searchParams.set('fromDate', '');
      tangoUrl.searchParams.set('toDate', '');
      tangoUrl.searchParams.set('pageSize', String(PAGE_SIZE));
      tangoUrl.searchParams.set('pageIndex', String(pageIndex));
      tangoUrl.searchParams.set('customQuery', companyQuery.customQuery!);

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

    const invoices: TangoInvoice[] = [];
    const firstPage = await fetchPage(0);
    const firstPageItems = Array.isArray(firstPage.list) ? firstPage.list as TangoInvoice[] : [];
    invoices.push(...firstPageItems);

    const sourceTotalCount = Number(firstPage.totalCount) || firstPageItems.length;
    const reportedTotalPages = Math.max(1, Number(firstPage.totalPages) || Math.ceil(sourceTotalCount / PAGE_SIZE));
    const pageLimit = Math.min(reportedTotalPages, MAX_PAGES);
    const truncated = reportedTotalPages > MAX_PAGES;

    for (let pageStart = 1; pageStart < pageLimit; pageStart += PAGE_BATCH_SIZE) {
      const pageIndexes = Array.from(
        { length: Math.min(PAGE_BATCH_SIZE, pageLimit - pageStart) },
        (_, index) => pageStart + index,
      );
      const pages = await Promise.all(pageIndexes.map(fetchPage));
      pages.forEach(page => {
        if (Array.isArray(page.list)) invoices.push(...page.list as TangoInvoice[]);
      });
    }

    const filtered = invoices.map(normalizeInvoice).filter(invoice => {
      const issueDate = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
      const clientText = normalize(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
      const sellerText = normalize(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);

      return (!fromDate || issueDate >= fromDate)
        && (!toDate || issueDate <= toDate)
        && (!clientFilter || clientText.includes(clientFilter))
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
