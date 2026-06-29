import { format, endOfMonth, startOfMonth } from 'date-fns';

import { dbAdmin } from '@/lib/firebase-admin';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
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
  normalizeTangoCode,
  normalizeTangoInvoice,
  normalizeTangoText,
} from '../../application/tango-invoice-utils';

const COMPANY_QUERIES: Record<TangoCompanyId, { process: string; customQuery: string }> = {
  '4': { process: '17943', customQuery: '1235' },
  '5': { process: '17943', customQuery: '1235' },
  '6': { process: '17943', customQuery: '1235' },
};
const PAGE_SIZE = 2000;
const MAX_PAGES = 100;

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
    throw new Error('TANGO_API_BASE_URL no es una URL válida');
  }
};

function splitFilter(value?: string) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

async function filterInvoicesForUser(invoices: TangoInvoice[], user?: ServerUser): Promise<TangoInvoice[]> {
  if (!user || hasServerManagementPrivileges(user)) return invoices;

  const userSnapshot = await dbAdmin.collection('users').doc(user.uid).get();
  const sellerConfig = Array.isArray(userSnapshot.data()?.sellerConfig)
    ? userSnapshot.data()?.sellerConfig as Array<{ companyName?: string; codes?: string[] }>
    : [];
  const userName = normalizeTangoText(user.name);

  return invoices.filter(invoice => {
    const company = tangoCompanies.find(item => item.id === invoice._companyId);
    const companyConfigs = sellerConfig.filter(config =>
      !company
      || normalizeTangoText(config.companyName).includes(company.sellerCompanySearch)
      || normalizeTangoText(config.companyName).includes(normalizeTangoText(company.label)),
    );
    const allowedCodes = companyConfigs.flatMap(config => config.codes || []).map(normalizeTangoCode);
    const invoiceSellerCode = normalizeTangoCode(invoice.COD_VENDEDOR);
    if (invoiceSellerCode && allowedCodes.includes(invoiceSellerCode)) return true;

    return userName.length > 0 && normalizeTangoText(invoice.NOMBRE_VENDEDOR) === userName;
  });
}

async function fetchCompanyInvoices(companyId: TangoCompanyId) {
  const companyQuery = COMPANY_QUERIES[companyId];
  const company = tangoCompanies.find(item => item.id === companyId);
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
        Company: companyId,
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
  const firstPageItems = Array.isArray(firstPage.list)
    ? firstPage.list.map((invoice: Record<string, unknown>) => ({
      ...normalizeTangoInvoice(invoice),
      _company: company?.label,
      _companyId: companyId,
    }))
    : [];
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
      if (Array.isArray(page.list)) {
        invoices.push(...page.list.map((invoice: Record<string, unknown>) => ({
          ...normalizeTangoInvoice(invoice),
          _company: company?.label,
          _companyId: companyId,
        })));
      }
    });
  }

  return { invoices, sourceTotalCount, truncated };
}

export async function listTangoInvoices(query: TangoInvoiceQuery, user?: ServerUser): Promise<TangoInvoiceResult> {
  const isOwnScope = Boolean(user && !hasServerManagementPrivileges(user));
  const companies = query.company === 'all'
    ? tangoCompanies
    : tangoCompanies.filter(company => company.id === query.company);
  const companyResults = await Promise.all(companies.map(company => fetchCompanyInvoices(company.id)));
  const invoices = companyResults.flatMap(result => result.invoices);
  const sourceTotalCount = companyResults.reduce((sum, result) => sum + result.sourceTotalCount, 0);
  const truncated = companyResults.some(result => result.truncated);

  const clientFilter = normalizeTangoText(query.client);
  const sellerFilter = normalizeTangoText(query.seller);
  const typeFilters = new Set(splitFilter(query.types).map(normalizeTangoText));
  const clientFilters = new Set(splitFilter(query.clients).map(normalizeTangoCode));
  const sellerFilters = new Set(splitFilter(query.sellers).map(normalizeTangoCode));
  const userVisibleInvoices = await filterInvoicesForUser(invoices, user);
  const visibleSourceTotalCount = isOwnScope ? userVisibleInvoices.length : sourceTotalCount;

  const filtered = userVisibleInvoices.filter(invoice => {
    const issueDate = String(invoice.FECHA_DE_EMISION || '').slice(0, 10);
    const clientText = normalizeTangoText(`${invoice.COD_CLIENTE || ''} ${invoice.RAZON_SOCIAL || ''}`);
    const sellerText = normalizeTangoText(`${invoice.COD_VENDEDOR || ''} ${invoice.NOMBRE_VENDEDOR || ''}`);
    const typeText = normalizeTangoText(invoice.TIPO_COMPROBANTE);
    const clientCode = normalizeTangoCode(invoice.COD_CLIENTE);
    const sellerCode = normalizeTangoCode(invoice.COD_VENDEDOR);
    return (!query.fromDate || issueDate >= query.fromDate)
      && (!query.toDate || issueDate <= query.toDate)
      && (!clientFilter || clientText.includes(clientFilter))
      && (!sellerFilter || sellerText.includes(sellerFilter))
      && (typeFilters.size === 0 || typeFilters.has(typeText))
      && (clientFilters.size === 0 || clientFilters.has(clientCode))
      && (sellerFilters.size === 0 || sellerFilters.has(sellerCode));
  });

  return {
    list: filtered,
    sourceTotalCount: visibleSourceTotalCount,
    filteredCount: filtered.length,
    truncated,
    scope: isOwnScope ? 'own' : 'all',
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
