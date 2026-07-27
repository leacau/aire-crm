import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { getClientServer } from '@/lib/server/clients';
import type { Client } from '@/lib/types';

const ALLOWED_COMPANIES = ['4', '5', '6'];
const DEFAULT_PDF_PROCESS = '14077';
const ERROR_PREVIEW_LENGTH = 600;
const INVOICE_PAGE_SIZE = 2000;
const INVOICE_PAGE_BATCH_SIZE = 5;
const INVOICE_MAX_PAGES = 100;
const COLLECTION_COMPANY_ID = '5';
const COLLECTION_COMPANY_LABEL = 'Aire SRL';
const COLLECTION_PAGE_SIZE = 2000;
const COLLECTION_PAGE_BATCH_SIZE = 5;
const COLLECTION_MAX_PAGES = 80;
const PDF_SIGNATURE = '%PDF-';

type CompanyQuery = {
  process?: string;
  customQuery?: string;
  label: string;
};

const COMPANY_QUERIES: Record<string, CompanyQuery> = {
  '4': { label: 'Aire', process: '17933', customQuery: '1237' },
  '5': { label: 'Aire SRL', process: '17933', customQuery: '1237' },
  '6': { label: 'Aire Digital SAS', process: '17933', customQuery: '1237' },
};

const COLLECTION_STATUS_QUERIES = {
  paid: { process: '12919', customQuery: '1239' },
  pending: { process: '12919', customQuery: '1241' },
} as const;

type CollectionStatus = keyof typeof COLLECTION_STATUS_QUERIES;

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

type TangoCollectionRecord = {
  id: string;
  status: CollectionStatus;
  companyId: string;
  companyLabel: string;
  issueDate: string;
  dueDate: string;
  paymentDate: string;
  voucherType: string;
  voucherNumber: string;
  clientCode: string;
  clientName: string;
  sellerCode: string;
  sellerName: string;
  daysLate: number | null;
  amount: number | null;
  invoiceTotal: number | null;
  imputedAmount: number | null;
  pendingAmount: number | null;
  source: Record<string, unknown>;
};

type ClientTangoCompanyMapping = {
  companyId: string;
  companyLabel: string;
  clientCode: string;
};

export type ClientTangoBillingSummary = {
  total: number;
  invoiceCount: number;
  truncated: boolean;
  byCompany: Array<{
    companyId: string;
    companyLabel: string;
    clientCode: string;
    total: number;
    invoiceCount: number;
    truncated: boolean;
  }>;
  skippedCompanies: Array<{ companyId: string; label: string; reason: string }>;
};

export class TangoApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const normalizeCompanyName = (value: unknown) => normalize(value).replace(/\s+/g, ' ');

const normalizeCode = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/^0+/, '');
  return normalized || (String(value || '').trim() ? '0' : '');
};

const isOfficialSeller = (value: unknown) => normalize(value).includes('oficial');

function getTangoAuthorization() {
  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;
  if (!apiAuthorization) throw new TangoApiError('Falta configurar TANGO_API_AUTHORIZATION', 503);
  return apiAuthorization;
}

function getTangoEndpoint(pathname: '/Api/GetApiLiveQueryData' | '/Api/GetPdf') {
  const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
  const cleanValue = configuredValue?.replace(/^["']|["']$/g, '');

  if (!cleanValue) {
    throw new TangoApiError('Falta configurar TANGO_API_BASE_URL', 503);
  }

  try {
    const url = new URL(cleanValue);
    url.pathname = pathname;
    url.search = '';
    return url;
  } catch {
    throw new TangoApiError('TANGO_API_BASE_URL no es una URL valida', 503);
  }
}

function assertAllowedCompany(company: string) {
  if (!ALLOWED_COMPANIES.includes(company)) {
    throw new TangoApiError('Company no permitida', 400);
  }
}

const parseTangoNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;

  const rawValue = String(value).trim().replace(/[^\d,.-]/g, '');
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

const firstValue = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const getSellerCodesForCompany = (
  sellerConfig: Array<{ companyName: string; codes: string[] }> | undefined,
  companyLabel: string,
) => {
  const expectedName = normalizeCompanyName(companyLabel);
  const config = sellerConfig?.find(item => normalizeCompanyName(item.companyName) === expectedName);
  return new Set((config?.codes || []).map(normalizeCode).filter(Boolean));
};

async function fetchTangoLiveQueryPage({
  apiAuthorization,
  company,
  processId,
  customQuery,
  pageIndex,
  pageSize,
}: {
  apiAuthorization: string;
  company: string;
  processId: string;
  customQuery: string;
  pageIndex: number;
  pageSize: number;
}) {
  const tangoUrl = getTangoEndpoint('/Api/GetApiLiveQueryData');
  tangoUrl.searchParams.set('process', processId);
  tangoUrl.searchParams.set('fromDate', '');
  tangoUrl.searchParams.set('toDate', '');
  tangoUrl.searchParams.set('pageSize', String(pageSize));
  tangoUrl.searchParams.set('pageIndex', String(pageIndex));
  tangoUrl.searchParams.set('customQuery', customQuery);

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
}

async function fetchTangoLiveQueryList({
  apiAuthorization,
  company,
  processId,
  customQuery,
  pageSize,
  pageBatchSize,
  maxPages,
}: {
  apiAuthorization: string;
  company: string;
  processId: string;
  customQuery: string;
  pageSize: number;
  pageBatchSize: number;
  maxPages: number;
}) {
  const items: Record<string, unknown>[] = [];
  const fetchPage = (pageIndex: number) => fetchTangoLiveQueryPage({
    apiAuthorization,
    company,
    processId,
    customQuery,
    pageIndex,
    pageSize,
  });

  const firstPage = await fetchPage(0);
  const firstPageItems = Array.isArray(firstPage.list) ? firstPage.list as Record<string, unknown>[] : [];
  items.push(...firstPageItems);

  const sourceTotalCount = Number(firstPage.totalCount) || firstPageItems.length;
  const reportedTotalPages = Math.max(1, Number(firstPage.totalPages) || Math.ceil(sourceTotalCount / pageSize));
  const pageLimit = Math.min(reportedTotalPages, maxPages);
  const truncated = reportedTotalPages > maxPages;

  for (let pageStart = 1; pageStart < pageLimit; pageStart += pageBatchSize) {
    const pageIndexes = Array.from(
      { length: Math.min(pageBatchSize, pageLimit - pageStart) },
      (_, index) => pageStart + index,
    );
    const pages = await Promise.all(pageIndexes.map(fetchPage));
    pages.forEach(page => {
      if (Array.isArray(page.list)) items.push(...page.list as Record<string, unknown>[]);
    });
  }

  return { items, sourceTotalCount, truncated };
}

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

export async function listTangoClientsServer(company: string) {
  if (!company) throw new TangoApiError('Falta el ID de Company', 400);
  assertAllowedCompany(company);

  const apiAuthorization = getTangoAuthorization();
  const tangoUrl = getTangoEndpoint('/Api/GetApiLiveQueryData');
  tangoUrl.searchParams.set('process', '17961');
  tangoUrl.searchParams.set('fromDate', '');
  tangoUrl.searchParams.set('toDate', '');
  tangoUrl.searchParams.set('pageSize', '2000');
  tangoUrl.searchParams.set('pageIndex', '0');
  tangoUrl.searchParams.set('customQuery', '0');

  const response = await fetch(tangoUrl, {
    method: 'GET',
    headers: {
      ApiAuthorization: apiAuthorization,
      Company: company,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const textError = await response.text();
    throw new Error(`Tango rechazo la conexion (Status ${response.status}). Detalles: ${textError}`);
  }

  return response.json();
}

export async function listTangoInvoicesServer({
  company,
  fromDate,
  toDate,
  client,
  seller,
  requester,
  skipSellerFilter = false,
}: {
  company: string;
  fromDate: string;
  toDate: string;
  client?: string | null;
  seller?: string | null;
  requester: ServerUser;
  skipSellerFilter?: boolean;
}) {
  const companyIds = company === 'all' ? Object.keys(COMPANY_QUERIES) : [company];
  if (companyIds.some(companyId => !COMPANY_QUERIES[companyId])) {
    throw new TangoApiError('Company no permitida', 400);
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new TangoApiError('El rango de fechas no es valido', 400);
  }

  const apiAuthorization = getTangoAuthorization();
  const clientFilter = normalize(client);
  const sellerFilter = normalize(seller);
  const canSeeAllInvoices = skipSellerFilter || hasServerManagementPrivileges(requester);
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
      : getSellerCodesForCompany(requester.sellerConfig, companyQuery.label);

    if (allowedSellerCodes && allowedSellerCodes.size === 0) {
      return { invoices: [] as TangoInvoice[], sourceTotalCount: 0, truncated: false };
    }

    const result = await fetchTangoLiveQueryList({
      apiAuthorization,
      company: companyId,
      processId: companyQuery.process,
      customQuery: companyQuery.customQuery,
      pageSize: INVOICE_PAGE_SIZE,
      pageBatchSize: INVOICE_PAGE_BATCH_SIZE,
      maxPages: INVOICE_MAX_PAGES,
    });

    const invoices = result.items.map(rawInvoice => ({
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

    return { invoices, sourceTotalCount: result.sourceTotalCount, truncated: result.truncated };
  };

  const companyResults = await Promise.all(companyIds.map(fetchCompanyInvoices));
  const filtered = companyResults.flatMap(result => result.invoices);
  const sourceTotalCount = companyResults.reduce((sum, result) => sum + result.sourceTotalCount, 0);
  const truncated = companyResults.some(result => result.truncated);

  return {
    list: filtered,
    sourceTotalCount,
    filteredCount: filtered.length,
    truncated,
    skippedCompanies,
  };
}

function getClientTangoCompanyMappings(client: Client): ClientTangoCompanyMapping[] {
  const mappings: ClientTangoCompanyMapping[] = [];

  if (client.idAire) {
    mappings.push({ companyId: '4', companyLabel: COMPANY_QUERIES['4'].label, clientCode: String(client.idAire) });
  }

  const srlClientCode = client.idAireSrl || client.idTango || client.tangoCompanyId;
  if (srlClientCode) {
    mappings.push({ companyId: '5', companyLabel: COMPANY_QUERIES['5'].label, clientCode: String(srlClientCode) });
  }

  if (client.idAireDigital) {
    mappings.push({ companyId: '6', companyLabel: COMPANY_QUERIES['6'].label, clientCode: String(client.idAireDigital) });
  }

  return mappings;
}

export async function getClientTangoBillingSummaryServer(
  clientId: string,
  requester: ServerUser,
): Promise<ClientTangoBillingSummary> {
  const client = await getClientServer(clientId, requester);
  const mappings = getClientTangoCompanyMappings(client);
  const skippedCompanies: ClientTangoBillingSummary['skippedCompanies'] = [];

  const emptySummary: ClientTangoBillingSummary = {
    total: 0,
    invoiceCount: 0,
    truncated: false,
    byCompany: [],
    skippedCompanies,
  };

  if (mappings.length === 0) {
    skippedCompanies.push({ companyId: 'all', label: 'Tango', reason: 'Cliente sin IDs de Tango vinculados' });
    return emptySummary;
  }

  const companySummaries = await Promise.all(mappings.map(async mapping => {
    try {
      const result = await listTangoInvoicesServer({
        company: mapping.companyId,
        fromDate: '',
        toDate: '',
        client: null,
        requester,
        skipSellerFilter: true,
      });
      const expectedClientCode = normalizeCode(mapping.clientCode);
      const invoices = result.list.filter(invoice => normalizeCode(invoice.COD_CLIENTE) === expectedClientCode);

      return {
        companyId: mapping.companyId,
        companyLabel: mapping.companyLabel,
        clientCode: mapping.clientCode,
        total: invoices.reduce((sum, invoice) => sum + (parseTangoNumber(invoice.TOTAL) || 0), 0),
        invoiceCount: invoices.length,
        truncated: Boolean(result.truncated),
        skippedCompanies: result.skippedCompanies || [],
      };
    } catch (error) {
      skippedCompanies.push({
        companyId: mapping.companyId,
        label: mapping.companyLabel,
        reason: error instanceof Error ? error.message : 'No se pudo consultar Tango',
      });

      return {
        companyId: mapping.companyId,
        companyLabel: mapping.companyLabel,
        clientCode: mapping.clientCode,
        total: 0,
        invoiceCount: 0,
        truncated: false,
        skippedCompanies: [],
      };
    }
  }));

  companySummaries.forEach(summary => {
    skippedCompanies.push(...summary.skippedCompanies);
  });

  return {
    total: companySummaries.reduce((sum, summary) => sum + summary.total, 0),
    invoiceCount: companySummaries.reduce((sum, summary) => sum + summary.invoiceCount, 0),
    truncated: companySummaries.some(summary => summary.truncated),
    byCompany: companySummaries.map(({ skippedCompanies: _skippedCompanies, ...summary }) => summary),
    skippedCompanies,
  };
}

const parseTangoDate = (value: unknown) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoDate = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const parsed = new Date(`${isoDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const month = Number(slashMatch[2]) - 1;
    const day = Number(slashMatch[1]);
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const calculateDaysLate = (dueDate: string) => {
  const due = parseTangoDate(dueDate);
  if (!due) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.floor((todayStart.getTime() - dueStart.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
};

const buildRecordKey = (clientCode: string, voucherNumber: string, voucherType: string) =>
  `${normalizeCode(clientCode)}|${String(voucherType || '').trim()}|${String(voucherNumber || '').trim()}`;

const buildVoucherNumberKey = (voucherNumber: string) => `voucher|${String(voucherNumber || '').trim()}`;

const getInvoiceTotal = (
  invoiceTotals: Map<string, number>,
  clientCode: string,
  voucherNumber: string,
  voucherType: string,
) => invoiceTotals.get(buildRecordKey(clientCode, voucherNumber, voucherType))
  ?? invoiceTotals.get(buildVoucherNumberKey(voucherNumber))
  ?? null;

const getCollectionGroupKey = (record: Pick<TangoCollectionRecord, 'clientCode' | 'voucherNumber' | 'voucherType'>) =>
  buildRecordKey(record.clientCode, record.voucherNumber, record.voucherType) || buildVoucherNumberKey(record.voucherNumber);

const normalizeCollectionRecord = (
  raw: Record<string, any>,
  status: CollectionStatus,
  invoiceTotals: Map<string, number>,
): TangoCollectionRecord => {
  const issueDate = String(firstValue(raw, ['FECHA_DE_EMISION', 'FECHA_EMISION', 'FECHA']) || '').slice(0, 10);
  const dueDate = String(firstValue(raw, ['FECHA_DE_VENCIMIENTO', 'FECHA_VENCIMIENTO', 'FECHA_VTO', 'VENCIMIENTO']) || '').slice(0, 10);
  const paymentDate = String(firstValue(raw, ['FECHA_IMPUTACION', 'FECHA_PAGO', 'FECHA_COBRO', 'FECHA_CANCELACION']) || '').slice(0, 10);
  const voucherType = String(firstValue(raw, ['TIPO_COMPROBANTE', 'COD_TIPO_COMPROBANTE', 'DESC_TIPO_COMPROBANTE', 'TIPO']) || '').trim();
  const voucherNumber = String(firstValue(raw, ['NRO_COMPROBANTE', 'NUMERO_COMPROBANTE', 'COMPROBANTE', 'N_COMP']) || '').trim();
  const clientCode = String(firstValue(raw, ['COD_CLIENTE', 'CODIGO_CLIENTE', 'CLIENTE']) || '').trim();
  const clientName = String(firstValue(raw, ['RAZON_SOCIAL', 'NOMBRE_COMERCIAL', 'NOMBRE_CLIENTE', 'CLIENTE']) || '').trim();
  const sellerCode = String(firstValue(raw, ['COD_VENDEDOR', 'COD_VEND', 'VENDEDOR']) || '').trim();
  const sellerName = String(firstValue(raw, ['NOMBRE_VENDEDOR', 'VENDEDOR_NOMBRE', 'NOMBRE_VEND']) || '').trim();
  const daysLate = status === 'pending' ? calculateDaysLate(dueDate) : null;
  const imputedAmount = parseTangoNumber(firstValue(raw, ['TOTAL_IMPUTADO', 'IMPORTE_IMPUTADO', 'IMPUTADO', 'MONTO_IMPUTADO']));
  const directAmount = parseTangoNumber(firstValue(raw, [
    'TOTAL',
    'IMPORTE',
    'IMPORTE_TOTAL',
    'TOTAL_COMPROBANTE',
    'MONTO',
  ]));
  const invoiceTotal = getInvoiceTotal(invoiceTotals, clientCode, voucherNumber, voucherType) ?? directAmount;
  const pendingAmount = status === 'pending' && invoiceTotal != null
    ? Math.max(invoiceTotal - (imputedAmount || 0), 0)
    : null;
  const amount = status === 'paid'
    ? (imputedAmount ?? directAmount)
    : (pendingAmount ?? invoiceTotal ?? directAmount);

  return {
    id: `${status}-${buildRecordKey(clientCode, voucherNumber, voucherType)}-${issueDate || paymentDate || dueDate}`,
    status,
    companyId: COLLECTION_COMPANY_ID,
    companyLabel: COLLECTION_COMPANY_LABEL,
    issueDate,
    dueDate,
    paymentDate,
    voucherType,
    voucherNumber,
    clientCode,
    clientName,
    sellerCode,
    sellerName,
    daysLate,
    amount,
    invoiceTotal,
    imputedAmount,
    pendingAmount,
    source: raw,
  };
};

const aggregatePendingRecords = (records: TangoCollectionRecord[]) => {
  const grouped = new Map<string, TangoCollectionRecord>();

  records.forEach(record => {
    const key = getCollectionGroupKey(record);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...record,
        imputedAmount: record.imputedAmount || 0,
        pendingAmount: null,
        amount: null,
      });
      return;
    }

    current.imputedAmount = (current.imputedAmount || 0) + (record.imputedAmount || 0);
    if (!current.issueDate && record.issueDate) current.issueDate = record.issueDate;
    if (!current.dueDate && record.dueDate) current.dueDate = record.dueDate;
    if (!current.paymentDate && record.paymentDate) current.paymentDate = record.paymentDate;
    if (!current.sellerCode && record.sellerCode) current.sellerCode = record.sellerCode;
    if (!current.sellerName && record.sellerName) current.sellerName = record.sellerName;
    if (current.invoiceTotal == null && record.invoiceTotal != null) current.invoiceTotal = record.invoiceTotal;
  });

  return Array.from(grouped.values()).map(record => {
    const imputedAmount = record.imputedAmount || 0;
    const pendingAmount = record.invoiceTotal != null
      ? Math.max(record.invoiceTotal - imputedAmount, 0)
      : null;

    return {
      ...record,
      id: `pending-${getCollectionGroupKey(record)}`,
      imputedAmount,
      pendingAmount,
      amount: pendingAmount ?? record.amount,
      daysLate: calculateDaysLate(record.dueDate),
    };
  });
};

const buildInvoiceTotalsIndex = async (apiAuthorization: string) => {
  const { items } = await fetchTangoLiveQueryList({
    apiAuthorization,
    company: COLLECTION_COMPANY_ID,
    processId: '17933',
    customQuery: '1237',
    pageSize: COLLECTION_PAGE_SIZE,
    pageBatchSize: COLLECTION_PAGE_BATCH_SIZE,
    maxPages: COLLECTION_MAX_PAGES,
  });
  const totals = new Map<string, number>();

  items.forEach(raw => {
    const source = raw as Record<string, any>;
    const voucherType = String(firstValue(source, ['TIPO_COMPROBANTE', 'COD_TIPO_COMPROBANTE', 'DESC_TIPO_COMPROBANTE', 'TIPO']) || '').trim();
    const voucherNumber = String(firstValue(source, ['NRO_COMPROBANTE', 'NUMERO_COMPROBANTE', 'COMPROBANTE', 'N_COMP']) || '').trim();
    const clientCode = String(firstValue(source, ['COD_CLIENTE', 'CODIGO_CLIENTE', 'CLIENTE']) || '').trim();
    const total = parseTangoNumber(firstValue(source, ['TOTAL', 'IMPORTE', 'TOTAL_COMPROBANTE', 'NETO']));
    if (total != null) {
      totals.set(buildRecordKey(clientCode, voucherNumber, voucherType), total);
      if (voucherNumber) totals.set(buildVoucherNumberKey(voucherNumber), total);
    }
  });

  return totals;
};

export async function listTangoCollectionsServer({
  status,
  fromDate,
  toDate,
  requester,
}: {
  status: string;
  fromDate: string;
  toDate: string;
  requester: ServerUser;
}) {
  if (!(status in COLLECTION_STATUS_QUERIES)) {
    throw new TangoApiError('Estado de cobranza no permitido', 400);
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new TangoApiError('El rango de fechas no es valido', 400);
  }

  const collectionStatus = status as CollectionStatus;
  const apiAuthorization = getTangoAuthorization();
  const canSeeAll = hasServerManagementPrivileges(requester);
  const allowedSellerCodes = canSeeAll ? null : getSellerCodesForCompany(requester.sellerConfig, COLLECTION_COMPANY_LABEL);

  if (allowedSellerCodes && allowedSellerCodes.size === 0) {
    return {
      list: [],
      sourceTotalCount: 0,
      totalAmount: 0,
      truncated: false,
      canSeeAll,
    };
  }

  const query = COLLECTION_STATUS_QUERIES[collectionStatus];
  const [collectionResult, invoiceTotals] = await Promise.all([
    fetchTangoLiveQueryList({
      apiAuthorization,
      company: COLLECTION_COMPANY_ID,
      processId: query.process,
      customQuery: query.customQuery,
      pageSize: COLLECTION_PAGE_SIZE,
      pageBatchSize: COLLECTION_PAGE_BATCH_SIZE,
      maxPages: COLLECTION_MAX_PAGES,
    }),
    buildInvoiceTotalsIndex(apiAuthorization),
  ]);

  const normalizedRecords = collectionResult.items
    .map(raw => normalizeCollectionRecord(raw as Record<string, any>, collectionStatus, invoiceTotals));
  const records = (collectionStatus === 'pending' ? aggregatePendingRecords(normalizedRecords) : normalizedRecords)
    .filter(record => {
      const relevantDate = collectionStatus === 'paid'
        ? (record.paymentDate || record.issueDate)
        : (record.dueDate || record.issueDate);
      const sellerCode = normalizeCode(record.sellerCode);

      const matchesDate = collectionStatus === 'pending'
        ? true
        : (!fromDate || relevantDate >= fromDate) && (!toDate || relevantDate <= toDate);

      return matchesDate
        && !isOfficialSeller(record.sellerName)
        && (!allowedSellerCodes || allowedSellerCodes.has(sellerCode));
    });

  return {
    list: records,
    sourceTotalCount: collectionResult.sourceTotalCount,
    totalAmount: records.reduce((sum, record) => sum + (record.amount || 0), 0),
    truncated: collectionResult.truncated,
    canSeeAll,
  };
}

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

export async function downloadTangoInvoicePdfServer({
  company,
  invoiceId,
}: {
  company: string;
  invoiceId: string;
}) {
  assertAllowedCompany(company);
  if (!invoiceId.trim()) throw new TangoApiError('Falta el ID de la factura.', 400);

  const processId = process.env.TANGO_INVOICE_PDF_PROCESS?.trim() || DEFAULT_PDF_PROCESS;
  const apiAuthorization = getTangoAuthorization();
  const tangoUrl = getTangoEndpoint('/Api/GetPdf');
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

  return {
    body: new Uint8Array(pdfBuffer),
    context: `process=${processId}, company=${company}, id=${invoiceId.trim()}`,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition || `attachment; filename="${buildPdfFileName(company, invoiceId)}"`,
      'Content-Length': String(pdfBuffer.byteLength),
    },
  };
}
