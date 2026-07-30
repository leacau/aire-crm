import { addMonths, differenceInCalendarDays, isSameMonth, isWithinInterval, parse, parseISO } from 'date-fns';
import { sanitizeInvoiceNumber } from './invoice-utils';
import type { Client, Invoice, Opportunity, PaymentEntry, User } from './types';

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

export type BillingDateRange = {
  from?: Date;
  to?: Date;
};

const isDateInRange = (date: Date, dateRange?: BillingDateRange) => {
  if (!dateRange?.from || !dateRange?.to) return true;
  return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
};

const isCorporateClient = (client: Client) => (
  !client.ownerId || client.ownerName?.toUpperCase() === 'CORPORATIVO' || client.ownerName === 'Mario Altamirano'
);

const getAdvisorClientIds = ({
  clients,
  isBoss,
  selectedAdvisor,
}: {
  clients: Client[];
  isBoss: boolean;
  selectedAdvisor: string;
}) => {
  if (!isBoss || selectedAdvisor === 'all') return null;
  if (selectedAdvisor === 'corporativo') {
    return new Set(clients.filter(isCorporateClient).map((client) => client.id));
  }
  return new Set(clients.filter((client) => client.ownerId === selectedAdvisor).map((client) => client.id));
};

export const getBillingVisibleLists = ({
  opportunities,
  invoices,
  clients,
  selectedAdvisor,
  isBoss,
  user,
  dateRange,
  markedOnly,
  isDeletionMarked,
  prefsReady,
}: {
  opportunities: Opportunity[];
  invoices: Invoice[];
  clients: Client[];
  selectedAdvisor: string;
  isBoss: boolean;
  user: Pick<User, 'id'> | null | undefined;
  dateRange?: BillingDateRange;
  markedOnly: boolean;
  isDeletionMarked: (invoice: Invoice) => boolean;
  prefsReady: boolean;
}) => {
  if (!user?.id || !prefsReady) {
    return { toInvoiceOpps: [], toCollectInvoices: [], paidInvoices: [], creditNoteInvoices: [] };
  }

  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const opportunitiesById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const advisorClientIds = getAdvisorClientIds({ clients, isBoss, selectedAdvisor });

  const userWonOpps = opportunities.filter((opp) => {
    if (opp.stage !== 'Cerrado - Ganado') return false;

    const client = clientsById.get(opp.clientId);
    if (isOfficialSellerName(client?.ownerName)) return false;

    if (isBoss) {
      return advisorClientIds ? advisorClientIds.has(opp.clientId) : true;
    }

    return client?.ownerId === user.id;
  });

  const toInvoiceOpps: Opportunity[] = [];
  const invoicesByOppId = invoices.reduce((acc, invoice) => {
    if (!acc[invoice.opportunityId]) acc[invoice.opportunityId] = [];
    acc[invoice.opportunityId].push(invoice);
    return acc;
  }, {} as Record<string, Invoice[]>);

  userWonOpps.forEach((opp) => {
    if (!opp.createdAt) return;

    const creationDate = normalizeDateForComparison(opp.createdAt);
    if (!creationDate) return;
    const maxPeriodicity = opp.periodicidad?.[0] || 'Ocasional';
    const durationMonths = getPeriodDurationInMonths(maxPeriodicity);

    if (durationMonths > 0) {
      for (let index = 0; index < durationMonths; index += 1) {
        const monthDate = addMonths(creationDate, index);

        if (isDateInRange(monthDate, dateRange)) {
          const hasInvoiceForMonth = (invoicesByOppId[opp.id] || []).some((invoice) => {
            const invoiceDate = normalizeDateForComparison(invoice.date);
            return invoiceDate && !invoice.isCreditNote && isSameMonth(invoiceDate, monthDate);
          });

          if (!hasInvoiceForMonth) {
            toInvoiceOpps.push({
              ...opp,
              id: `${opp.id}_${monthDate.toISOString()}`,
              closeDate: monthDate.toISOString(),
            });
          }
        }
      }
    } else if (isDateInRange(creationDate, dateRange)) {
      const hasInvoiceInMonth = (invoicesByOppId[opp.id] || []).some((invoice) => {
        const invoiceDate = normalizeDateForComparison(invoice.date);
        return invoiceDate && !invoice.isCreditNote && isSameMonth(invoiceDate, creationDate);
      });

      if (!hasInvoiceInMonth) {
        toInvoiceOpps.push({ ...opp, closeDate: creationDate.toISOString() });
      }
    }
  });

  let userFilteredInvoices = invoices;
  if (isBoss) {
    if (selectedAdvisor !== 'all') {
      const advisorOppIds = new Set(opportunities.filter((opp) => advisorClientIds?.has(opp.clientId)).map((opp) => opp.id));
      userFilteredInvoices = invoices.filter((invoice) => advisorOppIds.has(invoice.opportunityId));
    }
  } else {
    const userClientIds = new Set(clients.filter((client) => client.ownerId === user.id).map((client) => client.id));
    const userOppIds = new Set(opportunities.filter((opp) => userClientIds.has(opp.clientId)).map((opp) => opp.id));
    userFilteredInvoices = invoices.filter((invoice) => userOppIds.has(invoice.opportunityId));
  }

  const visibleInvoicesBase = userFilteredInvoices.filter((invoice) => {
    const opp = opportunitiesById.get(invoice.opportunityId);
    const client = opp ? clientsById.get(opp.clientId) : undefined;
    return !isOfficialSellerName(client?.ownerName);
  });
  const visibleInvoices = markedOnly ? visibleInvoicesBase.filter(isDeletionMarked) : visibleInvoicesBase;

  const toCollectInvoices = visibleInvoices.filter((invoice) => {
    const invoiceDate = normalizeDateForComparison(invoice.date);
    return invoiceDate && isDateInRange(invoiceDate, dateRange) && invoice.status !== 'Pagada' && !invoice.isCreditNote;
  });
  const paidInvoices = visibleInvoices.filter((invoice) => {
    const paidDate = normalizeDateForComparison(invoice.datePaid);
    return paidDate && isDateInRange(paidDate, dateRange) && invoice.status === 'Pagada';
  });

  const creditNoteInvoices = visibleInvoices.filter((invoice) => {
    if (!invoice.isCreditNote) return false;
    if (!invoice.creditNoteMarkedAt) return false;
    const markedAt = normalizeDateForComparison(invoice.creditNoteMarkedAt);
    return !!markedAt && isDateInRange(markedAt, dateRange);
  });

  return { toInvoiceOpps, toCollectInvoices, paidInvoices, creditNoteInvoices };
};

export const getVisiblePayments = ({
  payments,
  isBoss,
  selectedAdvisor,
  user,
}: {
  payments: PaymentEntry[];
  isBoss: boolean;
  selectedAdvisor: string;
  user: Pick<User, 'id'> | null | undefined;
}) => {
  if (!user) return [] as PaymentEntry[];

  let baseList: PaymentEntry[] = [];

  if (isBoss) {
    if (selectedAdvisor === 'all') {
      baseList = payments;
    } else if (selectedAdvisor === 'corporativo') {
      baseList = payments.filter((payment) => !payment.advisorId || payment.advisorName?.toUpperCase() === 'CORPORATIVO' || payment.advisorName === 'Mario Altamirano');
    } else {
      baseList = payments.filter((payment) => payment.advisorId === selectedAdvisor);
    }
  } else {
    baseList = payments.filter((payment) => payment.advisorId === user.id);
  }

  return [...baseList]
    .filter((entry) => !isOfficialSellerName(entry.advisorName))
    .map((entry) => ({
      ...entry,
      daysLate: computeDaysLate(entry.dueDate || undefined) ?? entry.daysLate,
    }))
    .sort((left, right) => {
      const leftDate = parseFlexibleDate(left.dueDate) ?? parseFlexibleDate(left.issueDate) ?? parseFlexibleDate(left.createdAt) ?? new Date(0);
      const rightDate = parseFlexibleDate(right.dueDate) ?? parseFlexibleDate(right.issueDate) ?? parseFlexibleDate(right.createdAt) ?? new Date(0);
      return leftDate.getTime() - rightDate.getTime();
    });
};

export const billingItemMatchesSearch = ({
  item,
  searchTerm,
  clientsMap,
  opportunitiesMap,
}: {
  item: Invoice | Opportunity | PaymentEntry;
  searchTerm: string;
  clientsMap: Record<string, Client>;
  opportunitiesMap: Record<string, Opportunity>;
}) => {
  if (!searchTerm) return true;
  const lowerTerm = searchTerm.toLowerCase();

  if ('company' in item) {
    const payment = item as PaymentEntry;
    if (payment.company.toLowerCase().includes(lowerTerm)) return true;
    if (payment.comprobanteNumber?.toLowerCase().includes(lowerTerm)) return true;
    if (payment.razonSocial?.toLowerCase().includes(lowerTerm)) return true;
    return false;
  }

  if ('invoiceNumber' in item && item.invoiceNumber) {
    if (item.invoiceNumber.toLowerCase().includes(lowerTerm)) return true;
  }

  let client: Client | undefined;
  if ('clientId' in item) {
    client = clientsMap[item.clientId];
  } else {
    const opp = opportunitiesMap[item.opportunityId];
    if (opp) client = clientsMap[opp.clientId];
  }

  if (client) {
    if (client.denominacion.toLowerCase().includes(lowerTerm)) return true;
    if (client.razonSocial?.toLowerCase().includes(lowerTerm)) return true;
  }

  return false;
};

export type BillingPaymentSummaryRow = {
  advisorId: string;
  advisorName: string;
  ranges: {
    '1-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  total: number;
};

const getPaymentLateBucket = (daysLate: number): keyof BillingPaymentSummaryRow['ranges'] => {
  if (daysLate > 90) return '90+';
  if (daysLate > 60) return '61-90';
  if (daysLate > 30) return '31-60';
  return '1-30';
};

export const getPaymentSummaryRows = (payments: PaymentEntry[]): BillingPaymentSummaryRow[] => {
  const buckets: Record<string, BillingPaymentSummaryRow> = {};

  payments.forEach((entry) => {
    const daysLate = entry.daysLate ?? computeDaysLate(entry.dueDate || undefined);
    if (daysLate == null || daysLate <= 0) return;
    if (entry.status === 'Pagado') return;

    const amount =
      typeof entry.pendingAmount === 'number'
        ? entry.pendingAmount
        : typeof entry.amount === 'number'
          ? entry.amount
          : 0;

    if (!amount || Number.isNaN(amount)) return;

    const bucketKey = getPaymentLateBucket(daysLate);
    let advisorId = entry.advisorId;
    let advisorName = entry.advisorName || 'Sin asesor';

    if (!advisorId || advisorName.toUpperCase() === 'CORPORATIVO' || advisorName === 'Mario Altamirano') {
      advisorId = 'corporativo';
      advisorName = 'Corporativo';
    } else if (!advisorId) {
      advisorId = 'sin-asesor';
    }

    if (!buckets[advisorId]) {
      buckets[advisorId] = {
        advisorId,
        advisorName,
        ranges: { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
        total: 0,
      };
    }

    buckets[advisorId].ranges[bucketKey] += amount;
    buckets[advisorId].total += amount;
  });

  return Object.values(buckets).sort((left, right) => left.advisorName.localeCompare(right.advisorName, 'es'));
};
