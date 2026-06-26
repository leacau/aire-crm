import { format, endOfMonth, startOfMonth } from 'date-fns';

import type {
  ClientTangoInvoiceQuery,
  TangoBillingSummary,
  TangoCompanyId,
  TangoInvoice,
  TangoInvoiceQuery,
  TangoInvoiceResult,
} from '../../domain/tango-invoice';
import { tangoCompanies } from '../../domain/tango-invoice';
import {
  isAdvisorInvoice,
  normalizeTangoInvoice,
  normalizeTangoText,
} from '../../application/tango-invoice-utils';

const DEFAULT_TANGO_BASE_URL = 'https://040896-002.connect.axoft.com';
const COMPANY_QUERIES: Record<TangoCompanyId, { process: string; customQuery: string }> = {
  '4': { process: '17943', customQuery: '1235' },
  '5': { process: '17943', customQuery: '1235' },
  '6': { process: '17943', customQuery: '1235' },
};
const PAGE_SIZE = 2000;
const MAX_PAGES = 100;

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

export async function listTangoInvoices(query: TangoInvoiceQuery): Promise<TangoInvoiceResult> {
  const companyQuery = COMPANY_QUERIES[query.company];
  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;
  if (!apiAuthorization) {
    throw new Error('Falta configurar TANGO_API_AUTHORIZATION');
  }

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
        Company: query.company,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Tango respondió ${response.status}: ${details}`);
    }

    const payload = await response.json();
    if (payload?.succeeded === false) {
      throw new Error(payload?.message || payload?.exceptionInfo || 'Tango rechazó la consulta');
    }

    return payload?.resultData || {};
  };

  const firstPage = await fetchPage(0);
  const firstPageItems = Array.isArray(firstPage.list) ? firstPage.list.map(normalizeTangoInvoice) : [];
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
      if (Array.isArray(page.list)) invoices.push(...page.list.map(normalizeTangoInvoice));
    });
  }

  const clientFilter = normalizeTangoText(query.client);
  const sellerFilter = normalizeTangoText(query.seller);
  const filtered = invoices.filter(invoice => {
    const issueDate = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
    const clientText = normalizeTangoText(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
    const sellerText = normalizeTangoText(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);
    return (!query.fromDate || issueDate >= query.fromDate)
      && (!query.toDate || issueDate <= query.toDate)
      && (!clientFilter || clientText.includes(clientFilter))
      && (!sellerFilter || sellerText.includes(sellerFilter));
  });

  return {
    list: filtered,
    sourceTotalCount,
    filteredCount: filtered.length,
    truncated,
  };
}

export async function listClientTangoInvoices(query: ClientTangoInvoiceQuery): Promise<TangoInvoice[]> {
  const companyRequests = [
    { company: tangoCompanies[0], client: query.aireClientId },
    { company: tangoCompanies[1], client: query.srlClientId },
    { company: tangoCompanies[2], client: query.sasClientId },
  ].filter(item => item.client);

  const results = await Promise.all(companyRequests.map(async ({ company, client }) => {
    const result = await listTangoInvoices({ company: company.id, client });
    return result.list.map(invoice => ({
      ...invoice,
      _company: company.label,
      _companyId: company.id,
    }));
  }));

  return results
    .flat()
    .sort((left, right) => {
      const leftDate = left.FECHA_DE_EMISION ? new Date(left.FECHA_DE_EMISION).getTime() : 0;
      const rightDate = right.FECHA_DE_EMISION ? new Date(right.FECHA_DE_EMISION).getTime() : 0;
      return rightDate - leftDate;
    });
}

export async function getCurrentMonthTangoBillingSummary(today = new Date()): Promise<TangoBillingSummary> {
  const fromDate = format(startOfMonth(today), 'yyyy-MM-dd');
  const toDate = format(endOfMonth(today), 'yyyy-MM-dd');
  const companies = await Promise.all(tangoCompanies.map(async company => {
    const result = await listTangoInvoices({ company: company.id, fromDate, toDate });
    const advisorInvoices = result.list.filter(isAdvisorInvoice);
    const total = advisorInvoices.reduce((sum, invoice) => sum + Number(invoice.TOTAL || 0), 0);
    return {
      company: company.id,
      label: company.label,
      total,
      invoiceCount: advisorInvoices.length,
    };
  }));

  return {
    total: companies.reduce((sum, company) => sum + company.total, 0),
    fromDate,
    toDate,
    companies,
  };
}
