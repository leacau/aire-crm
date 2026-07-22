import { NextResponse } from 'next/server';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { tangoErrorResponse, tangoMissingConfigResponse } from '@/app/api/tango/utils';

const COMPANY_ID = '5';
const COMPANY_LABEL = 'Aire SRL';
const PAGE_SIZE = 2000;
const PAGE_BATCH_SIZE = 5;
const MAX_PAGES = 80;

const STATUS_QUERIES = {
  paid: { process: '12919', customQuery: '1239' },
  pending: { process: '12919', customQuery: '1241' },
} as const;

type CollectionStatus = keyof typeof STATUS_QUERIES;

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

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const normalizeCode = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/^0+/, '');
  return normalized || (String(value || '').trim() ? '0' : '');
};

const normalizeCompanyName = (value: unknown) => normalize(value).replace(/\s+/g, ' ');
const isOfficialSeller = (value: unknown) => normalize(value).includes('oficial');

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

const getSellerCodesForCompany = (
  sellerConfig: Array<{ companyName: string; codes: string[] }> | undefined,
) => {
  const expectedName = normalizeCompanyName(COMPANY_LABEL);
  const config = sellerConfig?.find(item => normalizeCompanyName(item.companyName) === expectedName);
  return new Set((config?.codes || []).map(normalizeCode).filter(Boolean));
};

const fetchTangoList = async (
  apiAuthorization: string,
  processId: string,
  customQuery: string,
) => {
  const fetchPage = async (pageIndex: number) => {
    const tangoUrl = getTangoEndpoint();
    tangoUrl.searchParams.set('process', processId);
    tangoUrl.searchParams.set('fromDate', '');
    tangoUrl.searchParams.set('toDate', '');
    tangoUrl.searchParams.set('pageSize', String(PAGE_SIZE));
    tangoUrl.searchParams.set('pageIndex', String(pageIndex));
    tangoUrl.searchParams.set('customQuery', customQuery);

    const response = await fetch(tangoUrl, {
      method: 'GET',
      headers: {
        ApiAuthorization: apiAuthorization,
        Company: COMPANY_ID,
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

  const items: Record<string, unknown>[] = [];
  const firstPage = await fetchPage(0);
  const firstPageItems = Array.isArray(firstPage.list) ? firstPage.list as Record<string, unknown>[] : [];
  items.push(...firstPageItems);

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
      if (Array.isArray(page.list)) items.push(...page.list as Record<string, unknown>[]);
    });
  }

  return { items, sourceTotalCount, truncated };
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
    companyId: COMPANY_ID,
    companyLabel: COMPANY_LABEL,
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
  const { items } = await fetchTangoList(apiAuthorization, '17933', '1237');
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

export async function GET(request: Request) {
  const serverUser = await requireServerUser(request);
  if (isServerResponse(serverUser)) return serverUser;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'paid') as CollectionStatus;
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  if (!STATUS_QUERIES[status]) {
    return NextResponse.json({ error: 'Estado de cobranza no permitido' }, { status: 400 });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: 'El rango de fechas no es valido' }, { status: 400 });
  }

  const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;
  if (!apiAuthorization) {
    return tangoMissingConfigResponse('TANGO_API_AUTHORIZATION');
  }

  try {
    const canSeeAll = hasServerManagementPrivileges(serverUser);
    const allowedSellerCodes = canSeeAll ? null : getSellerCodesForCompany(serverUser.sellerConfig);

    if (allowedSellerCodes && allowedSellerCodes.size === 0) {
      return NextResponse.json({
        list: [],
        sourceTotalCount: 0,
        totalAmount: 0,
        truncated: false,
        canSeeAll,
      });
    }

    const query = STATUS_QUERIES[status];
    const [collectionResult, invoiceTotals] = await Promise.all([
      fetchTangoList(apiAuthorization, query.process, query.customQuery),
      buildInvoiceTotalsIndex(apiAuthorization),
    ]);

    const normalizedRecords = collectionResult.items
      .map(raw => normalizeCollectionRecord(raw as Record<string, any>, status, invoiceTotals));
    const records = (status === 'pending' ? aggregatePendingRecords(normalizedRecords) : normalizedRecords)
      .filter(record => {
        const relevantDate = status === 'paid'
          ? (record.paymentDate || record.issueDate)
          : (record.dueDate || record.issueDate);
        const sellerCode = normalizeCode(record.sellerCode);

        const matchesDate = status === 'pending'
          ? true
          : (!fromDate || relevantDate >= fromDate) && (!toDate || relevantDate <= toDate);

        return matchesDate
          && !isOfficialSeller(record.sellerName)
          && (!allowedSellerCodes || allowedSellerCodes.has(sellerCode));
      });

    return NextResponse.json({
      list: records,
      sourceTotalCount: collectionResult.sourceTotalCount,
      totalAmount: records.reduce((sum, record) => sum + (record.amount || 0), 0),
      truncated: collectionResult.truncated,
      canSeeAll,
    });
  } catch (error) {
    return tangoErrorResponse(error, {
      action: 'COLLECTIONS LIST',
      requesterId: serverUser.uid,
      publicError: 'No se pudieron consultar las cobranzas de Tango',
    });
  }
}
