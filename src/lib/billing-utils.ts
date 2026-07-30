import { differenceInCalendarDays, parse, parseISO } from 'date-fns';
import { sanitizeInvoiceNumber } from './invoice-utils';
import type { Invoice, Opportunity, PaymentEntry } from './types';

const PAYMENT_DATE_FORMATS = [
  { format: 'yyyy-MM-dd', pattern: /^\d{4}-\d{1,2}-\d{1,2}$/ },
  { format: 'dd/MM/yyyy', pattern: /^\d{2}\/\d{2}\/\d{4}$/ },
  { format: 'd/M/yyyy', pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/ },
  { format: 'dd-MM-yyyy', pattern: /^\d{2}-\d{2}-\d{4}$/ },
  { format: 'd-M-yyyy', pattern: /^\d{1,2}-\d{1,2}-\d{4}$/ },
  { format: 'dd/MM/yy', pattern: /^\d{2}\/\d{2}\/\d{2}$/ },
  { format: 'd/M/yy', pattern: /^\d{1,2}\/\d{1,2}\/\d{2}$/ },
  { format: 'dd-MM-yy', pattern: /^\d{2}-\d{2}-\d{2}$/ },
  { format: 'd-M-yy', pattern: /^\d{1,2}-\d{1,2}-\d{2}$/ },
];

export const getPeriodDurationInMonths = (period: string): number => {
  switch (period) {
    case 'Mensual': return 1;
    case 'Trimestral': return 3;
    case 'Semestral': return 6;
    case 'Anual': return 12;
    default: return 0;
  }
};

export const parseFlexibleDate = (raw?: string | null) => {
  if (!raw) return null;
  const value = raw.toString().trim();

  const tryParse = (parser: () => Date) => {
    try {
      const parsed = parser();
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch (error) {
      return null;
    }
    return null;
  };

  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? tryParse(() => parseISO(value)) : null;
  return isoDate ?? PAYMENT_DATE_FORMATS.reduce<Date | null>(
    (acc, candidate) => acc ?? (candidate.pattern.test(value) ? tryParse(() => parse(value, candidate.format, new Date())) : null),
    null,
  );
};

export const normalizeDate = (raw?: string) => {
  const parsed = parseFlexibleDate(raw);
  if (parsed) return parsed.toISOString();
  return raw ? String(raw).trim() : undefined;
};

export const normalizeDateKey = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().split('T')[0];
  if (raw && typeof raw === 'object' && typeof (raw as any).toDate === 'function') {
    const parsedTimestamp = (raw as any).toDate();
    if (parsedTimestamp instanceof Date && !Number.isNaN(parsedTimestamp.getTime())) {
      return parsedTimestamp.toISOString().split('T')[0];
    }
  }
  const parsed = parseFlexibleDate(raw == null ? null : String(raw));
  if (parsed) return parsed.toISOString().split('T')[0];
  const value = raw == null ? '' : String(raw).trim();
  return value ? value.split('T')[0] : '';
};

export const normalizeDateForComparison = (raw: unknown) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (raw && typeof raw === 'object' && typeof (raw as any).toDate === 'function') {
    const parsedTimestamp = (raw as any).toDate();
    if (parsedTimestamp instanceof Date && !Number.isNaN(parsedTimestamp.getTime())) return parsedTimestamp;
  }
  return parseFlexibleDate(raw == null ? null : String(raw));
};

export const isOfficialSellerName = (value?: string | null) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('oficial')
);

export const computeDaysLate = (dueDate?: string) => {
  const parsedDate = parseFlexibleDate(dueDate);
  if (!parsedDate) return null;
  const diff = differenceInCalendarDays(new Date(), parsedDate);
  return diff > 0 ? diff : 0;
};

export const parsePastedPayments = (
  raw: string,
): Omit<PaymentEntry, 'id' | 'advisorId' | 'advisorName' | 'status' | 'createdAt'>[] => {
  const parseAmount = (value?: string) => {
    if (!value) return undefined;
    const cleaned = String(value).replace(/[^0-9.,-]/g, '');
    const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    const numeric = parseFloat(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cols) => cols.length >= 7)
    .map((cols) => {
      const [company, , comprobante, razonSocial, pendingRaw, issueDateRaw, dueDateRaw] = cols;
      const pendingAmount = parseAmount(pendingRaw);
      const dueDate = normalizeDate(dueDateRaw);
      const issueDate = normalizeDate(issueDateRaw);

      return {
        company: company || '-',
        comprobanteNumber: comprobante || undefined,
        razonSocial: razonSocial || undefined,
        pendingAmount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        amount: Number.isFinite(pendingAmount) ? pendingAmount : undefined,
        issueDate,
        dueDate,
        daysLate: computeDaysLate(dueDate || undefined) ?? undefined,
        notes: '',
        nextContactAt: null,
      };
    });
};

export type DuplicateInvoiceGroup = {
  key: string;
  label: string;
  invoices: Invoice[];
  hasCreditNote: boolean;
  type: 'exact' | 'number';
};

export const getDuplicateInvoiceGroups = ({
  invoices,
  opportunitiesMap,
  isCreditNoteRelated,
}: {
  invoices: Invoice[];
  opportunitiesMap: Record<string, Opportunity>;
  isCreditNoteRelated: (invoice: Invoice) => boolean;
}) => {
  const invoiceData = invoices.map((inv) => {
    const raw = sanitizeInvoiceNumber(inv.invoiceNumber || '');
    const sig = raw.replace(/^0+/, '');
    return {
      inv,
      id: inv.id,
      sig,
    };
  });

  const parent: Record<string, string> = {};
  invoiceData.forEach((d) => {
    parent[d.id] = d.id;
  });

  const find = (id: string): string => {
    if (parent[id] === id) return id;
    parent[id] = find(parent[id]);
    return parent[id];
  };

  const union = (left: string, right: string) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootLeft] = rootRight;
  };

  const bySig: Record<string, string[]> = {};
  invoiceData.forEach((d) => {
    if (!d.sig) return;
    if (!bySig[d.sig]) bySig[d.sig] = [];
    bySig[d.sig].push(d.id);
  });

  Object.values(bySig).forEach((ids) => {
    for (let index = 1; index < ids.length; index += 1) {
      union(ids[0], ids[index]);
    }
  });

  const uniqueSigs = Object.keys(bySig);
  const shortSigs = uniqueSigs.filter((sig) => sig.length >= 4 && sig.length <= 6);

  for (const short of shortSigs) {
    for (const other of uniqueSigs) {
      if (short === other) continue;
      if (other.length > short.length && other.endsWith(short)) {
        const shortIds = bySig[short];
        const otherIds = bySig[other];
        if (shortIds?.length && otherIds?.length) {
          union(shortIds[0], otherIds[0]);
        }
      }
    }
  }

  const groupsMap: Record<string, Invoice[]> = {};
  invoiceData.forEach((d) => {
    const root = find(d.id);
    if (!groupsMap[root]) groupsMap[root] = [];
    groupsMap[root].push(d.inv);
  });

  const exactDuplicateGroups: DuplicateInvoiceGroup[] = [];
  const numberDuplicateGroups: DuplicateInvoiceGroup[] = [];

  Object.values(groupsMap).forEach((groupInvoices) => {
    if (groupInvoices.length < 2) return;

    const getIdentity = (inv: Invoice) => {
      const opp = opportunitiesMap[inv.opportunityId];
      const clientId = opp?.clientId || 'unknown';
      const date = normalizeDateKey(inv.date) || 'nodate';
      const amount = Math.abs(inv.amount).toFixed(2);
      return `${clientId}|${date}|${amount}`;
    };

    const firstIdentity = getIdentity(groupInvoices[0]);
    const allIdentical = groupInvoices.every((inv) => getIdentity(inv) === firstIdentity);

    groupInvoices.sort((a, b) => (b.invoiceNumber || '').length - (a.invoiceNumber || '').length);

    const groupObj: DuplicateInvoiceGroup = {
      key: groupInvoices[0].id,
      label: `Factura ${groupInvoices[0].invoiceNumber}`,
      invoices: groupInvoices,
      hasCreditNote: groupInvoices.some(isCreditNoteRelated),
      type: allIdentical ? 'exact' : 'number',
    };

    if (allIdentical) exactDuplicateGroups.push(groupObj);
    else numberDuplicateGroups.push(groupObj);
  });

  exactDuplicateGroups.sort((a, b) => a.label.localeCompare(b.label));
  numberDuplicateGroups.sort((a, b) => a.label.localeCompare(b.label));

  return { exactDuplicateGroups, numberDuplicateGroups };
};
