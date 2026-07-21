import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';

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
    process: '17933',
    customQuery: '1237',
  },
  '5': {
    label: 'Aire SRL',
    process: '17933',
    customQuery: '1237',
  },
  '6': {
    label: 'Aire Digital SAS',
    process: '17933',
    customQuery: '1237',
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
  NOMBRE_COMERCIAL?: string;
  SUBTOTAL?: number | string | null;
  IVA?: number | string | null;
  TOTAL_SIN_IMPUESTOS?: number | string | null;
  TOTAL_BONIFICADO?: number | string | null;
  TOTAL?: number | string | null;
  ID_GVA14?: number | null;
  ID_GVA12?: string | number | null;
  ID_GVA23?: number | null;
  ID_GVA38?: number | null;
  _companyId?: string;
  _companyLabel?: string;
};

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getTangoEndpoint = () => {
  const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
  const cleanValue = configuredValue?.replace(/^["']|["']$/g, '');

  if (!cleanValue) {
    throw new Error('Falta configurar TANGO_API_BASE_URL');
  }

  try {
    const url = new URL(cleanValue);
    url.pathname = '/Api/GetApiLiveQueryData';
    url.search = '';
    return url;
  } catch {
    throw new Error('TANGO_API_BASE_URL no es una URL valida');
  }
};

const parseTangoNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;

  const rawValue = String(value)
    .trim()
    .replace(/[^\d,.-]/g, '');

  if (!rawValue) return null;

  const hasComma = rawValue.includes(',');
  const hasDot = rawValue.includes('.');
  let normalized = rawValue;

  if (hasComma && hasDot) {
    normalized = rawValue.lastIndexOf('.') > rawValue.lastIndexOf(',')
      ? rawValue.replace(/,/g, '')
      : rawValue.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const parts = rawValue.split(',');
    const lastPart = parts[parts.length - 1] || '';
    normalized = parts.length > 1 && lastPart.length === 3
      ? rawValue.replace(/,/g, '')
      : rawValue.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCompanyName = (value: unknown) => normalize(value).replace(/\s+/g, ' ');
const normalizeCode = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/^0+/, '');
  return normalized || (String(value || '').trim() ? '0' : '');
};
const isOfficialSeller = (value: unknown) => normalize(value).includes('oficial');

const getSellerCodesForCompany = (
  sellerConfig: Array<{ companyName: string; codes: string[] }> | undefined,
  companyId: string,
) => {
  const expectedName = normalizeCompanyName(COMPANY_QUERIES[companyId]?.label || '');
  const config = sellerConfig?.find(item => normalizeCompanyName(item.companyName) === expectedName);
  return new Set((config?.codes || []).map(normalizeCode).filter(Boolean));
};

const normalizeInvoice = (invoice: Record<string, any>): TangoInvoice => {
  const numericSubtotal = parseTangoNumber(invoice.SUBTOTAL);
  const numericIva = parseTangoNumber(invoice.IVA);
  const numericTotalSinImpuestos = parseTangoNumber(invoice.TOTAL_SIN_IMPUESTOS);
  const numericTotalBonificado = parseTangoNumber(invoice.TOTAL_BONIFICADO);
  const numericTotal = parseTangoNumber(invoice.TOTAL ?? invoice.IMPORTE ?? invoice.TOTAL_COMPROBANTE ?? invoice.NETO);
  const clientName = invoice.RAZON_SOCIAL || invoice.NOMBRE_COMERCIAL || invoice.NOMBRE_CLIENTE || '';

  return {
    ...invoice,
    FECHA_DE_EMISION: invoice.FECHA_DE_EMISION || invoice.FECHA_EMISION || invoice.FECHA || '',
    TIPO_COMPROBANTE: invoice.TIPO_COMPROBANTE
      || invoice.DESC_TIPO_COMPROBANTE
      || invoice.COD_TIPO_COMPROBANTE
      || invoice.TIPO
      || undefined,
    RAZON_SOCIAL: clientName,
    NOMBRE_COMERCIAL: invoice.NOMBRE_COMERCIAL || clientName,
    SUBTOTAL: numericSubtotal,
    IVA: numericIva,
    TOTAL_SIN_IMPUESTOS: numericTotalSinImpuestos,
    TOTAL_BONIFICADO: numericTotalBonificado,
    TOTAL: numericTotal,
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

  const companyIds = company === 'all' ? Object.keys(COMPANY_QUERIES) : [company];
  if (companyIds.some(companyId => !COMPANY_QUERIES[companyId])) {
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
    const canSeeAllInvoices = hasServerManagementPrivileges(serverUser);
    const skippedCompanies: Array<{ companyId: string; label: string; reason: string }> = [];

    const fetchCompanyInvoices = async (companyId: string) => {
      const companyQuery = COMPANY_QUERIES[companyId];
      if (!companyQuery.process || companyQuery.customQuery == null) {
        skippedCompanies.push({
          companyId,
          label: companyQuery.label,
          reason: 'Consulta no configurada',
        });
        return { invoices: [] as TangoInvoice[], sourceTotalCount: 0, truncated: false };
      }

      const allowedSellerCodes = canSeeAllInvoices
        ? null
        : getSellerCodesForCompany(serverUser.sellerConfig, companyId);

      if (allowedSellerCodes && allowedSellerCodes.size === 0) {
        return { invoices: [] as TangoInvoice[], sourceTotalCount: 0, truncated: false };
      }

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
          Company: companyId,
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

      const filtered = invoices.map(rawInvoice => ({
        ...normalizeInvoice(rawInvoice as Record<string, any>),
        _companyId: companyId,
        _companyLabel: companyQuery.label,
      })).filter(invoice => {
      const issueDate = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
      const clientText = normalize(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
      const sellerText = normalize(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);
      const sellerCode = normalizeCode(invoice.COD_VENDEDOR);

      return (!fromDate || issueDate >= fromDate)
        && (!toDate || issueDate <= toDate)
        && (!clientFilter || clientText.includes(clientFilter))
        && (!sellerFilter || sellerText.includes(sellerFilter))
        && !isOfficialSeller(invoice.NOMBRE_VENDEDOR)
        && (!allowedSellerCodes || allowedSellerCodes.has(sellerCode));
    });

      return { invoices: filtered, sourceTotalCount, truncated };
    };

    const companyResults = await Promise.all(companyIds.map(fetchCompanyInvoices));
    const filtered = companyResults.flatMap(result => result.invoices);
    const sourceTotalCount = companyResults.reduce((sum, result) => sum + result.sourceTotalCount, 0);
    const truncated = companyResults.some(result => result.truncated);

    return NextResponse.json({
      list: filtered,
      sourceTotalCount,
      filteredCount: filtered.length,
      truncated,
      skippedCompanies,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error consulting Tango invoices:', error);
    return NextResponse.json({
      error: 'No se pudieron consultar las facturas de Tango',
      details: error instanceof Error ? error.message : 'Error desconocido',
    }, { status: 502 });
  }
}
