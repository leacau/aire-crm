import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  billingItemMatchesSearch,
  computeDaysLate,
  getBillingVisibleLists,
  getDuplicateInvoiceGroups,
  getPeriodDurationInMonths,
  getPaymentSummaryRows,
  getVisiblePayments,
  isOfficialSellerName,
  normalizeDateForComparison,
  normalizeDateKey,
  parseFlexibleDate,
  parsePastedPayments,
} from '../billing-utils';
import type { Client, Invoice, Opportunity, PaymentEntry, User } from '../types';

describe('billing-utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 30, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps opportunity periodicity to months', () => {
    expect(getPeriodDurationInMonths('Mensual')).toBe(1);
    expect(getPeriodDurationInMonths('Trimestral')).toBe(3);
    expect(getPeriodDurationInMonths('Semestral')).toBe(6);
    expect(getPeriodDurationInMonths('Anual')).toBe(12);
    expect(getPeriodDurationInMonths('Ocasional')).toBe(0);
  });

  it('parses common payment date formats', () => {
    expect(parseFlexibleDate('2026-07-15')?.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(parseFlexibleDate('15/07/2026')?.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(parseFlexibleDate('15-07-26')?.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('normalizes Firestore timestamps and raw strings to comparable dates', () => {
    const timestampLike = { toDate: () => new Date(2026, 6, 10) };

    expect(normalizeDateKey(timestampLike)).toBe('2026-07-10');
    expect(normalizeDateForComparison(timestampLike)?.toISOString().slice(0, 10)).toBe('2026-07-10');
    expect(normalizeDateKey('2026-07-11T03:00:00.000Z')).toBe('2026-07-11');
  });

  it('detects official sellers and computes late days without negative values', () => {
    expect(isOfficialSellerName('Vendedor Oficial SRL')).toBe(true);
    expect(isOfficialSellerName('Asesor Comercial')).toBe(false);
    expect(computeDaysLate('2026-07-20')).toBe(10);
    expect(computeDaysLate('2026-08-01')).toBe(0);
  });

  it('parses pasted payment rows from Tango export text', () => {
    const rows = parsePastedPayments(
      'Aire SRL\tignored\tFAC A 0001-00001234\tCliente SA\t$ 1.234,50\t15/07/2026\t20/07/2026',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company: 'Aire SRL',
      comprobanteNumber: 'FAC A 0001-00001234',
      razonSocial: 'Cliente SA',
      pendingAmount: 1234.5,
      amount: 1234.5,
      daysLate: 10,
      notes: '',
      nextContactAt: null,
    });
    expect(rows[0].issueDate?.slice(0, 10)).toBe('2026-07-15');
    expect(rows[0].dueDate?.slice(0, 10)).toBe('2026-07-20');
  });

  it('groups exact duplicate invoices by client, date and amount', () => {
    const result = getDuplicateInvoiceGroups({
      invoices: [
        invoice({ id: 'inv-1', invoiceNumber: 'FAC-000123', opportunityId: 'opp-1' }),
        invoice({ id: 'inv-2', invoiceNumber: '123', opportunityId: 'opp-1' }),
      ],
      opportunitiesMap: {
        'opp-1': opportunity({ id: 'opp-1', clientId: 'client-1' }),
      },
      isCreditNoteRelated: (item) => Boolean(item.isCreditNote),
    });

    expect(result.exactDuplicateGroups).toHaveLength(1);
    expect(result.exactDuplicateGroups[0]).toMatchObject({
      key: 'inv-1',
      label: 'Factura FAC-000123',
      hasCreditNote: false,
      type: 'exact',
    });
    expect(result.numberDuplicateGroups).toHaveLength(0);
  });

  it('separates number-only duplicates when client, date or amount differ', () => {
    const result = getDuplicateInvoiceGroups({
      invoices: [
        invoice({ id: 'inv-1', invoiceNumber: '00004567', opportunityId: 'opp-1', amount: 1000 }),
        invoice({ id: 'inv-2', invoiceNumber: '4567', opportunityId: 'opp-2', amount: 1500 }),
      ],
      opportunitiesMap: {
        'opp-1': opportunity({ id: 'opp-1', clientId: 'client-1' }),
        'opp-2': opportunity({ id: 'opp-2', clientId: 'client-2' }),
      },
      isCreditNoteRelated: (item) => Boolean(item.isCreditNote),
    });

    expect(result.exactDuplicateGroups).toHaveLength(0);
    expect(result.numberDuplicateGroups).toHaveLength(1);
    expect(result.numberDuplicateGroups[0].type).toBe('number');
  });

  it('marks duplicate groups that contain credit notes', () => {
    const result = getDuplicateInvoiceGroups({
      invoices: [
        invoice({ id: 'inv-1', invoiceNumber: '9876', opportunityId: 'opp-1' }),
        invoice({ id: 'inv-2', invoiceNumber: '009876', opportunityId: 'opp-1', isCreditNote: true }),
      ],
      opportunitiesMap: {
        'opp-1': opportunity({ id: 'opp-1', clientId: 'client-1' }),
      },
      isCreditNoteRelated: (item) => Boolean(item.isCreditNote),
    });

    expect(result.exactDuplicateGroups[0].hasCreditNote).toBe(true);
  });

  it('derives visible billing lists by advisor, date range and invoice status', () => {
    const result = getBillingVisibleLists({
      opportunities: [
        opportunity({ id: 'opp-monthly', clientId: 'client-1', createdAt: '2026-07-05', periodicidad: ['Mensual'] }),
        opportunity({ id: 'opp-once', clientId: 'client-2', createdAt: '2026-07-10', periodicidad: ['Ocasional'] }),
        opportunity({ id: 'opp-other', clientId: 'client-3', createdAt: '2026-07-10', periodicidad: ['Ocasional'] }),
      ],
      invoices: [
        invoice({ id: 'inv-collect', opportunityId: 'opp-monthly', date: '2026-07-08', status: 'Pendiente' }),
        invoice({ id: 'inv-paid', opportunityId: 'opp-monthly', datePaid: '2026-07-12', status: 'Pagada' }),
        invoice({ id: 'inv-credit', opportunityId: 'opp-monthly', isCreditNote: true, creditNoteMarkedAt: '2026-07-15' }),
      ],
      clients: [
        client({ id: 'client-1', ownerId: 'advisor-1' }),
        client({ id: 'client-2', ownerId: 'advisor-1' }),
        client({ id: 'client-3', ownerId: 'advisor-2' }),
      ],
      selectedAdvisor: 'all',
      isBoss: false,
      user: user({ id: 'advisor-1' }),
      dateRange: { from: new Date(2026, 6, 1), to: new Date(2026, 6, 31) },
      markedOnly: false,
      isDeletionMarked: () => false,
      prefsReady: true,
    });

    expect(result.toInvoiceOpps.map((item) => item.id)).toEqual(['opp-once']);
    expect(result.toCollectInvoices.map((item) => item.id)).toEqual(['inv-collect']);
    expect(result.paidInvoices.map((item) => item.id)).toEqual(['inv-paid']);
    expect(result.creditNoteInvoices.map((item) => item.id)).toEqual(['inv-credit']);
  });

  it('filters billing lists by selected advisor for management users', () => {
    const result = getBillingVisibleLists({
      opportunities: [
        opportunity({ id: 'opp-1', clientId: 'client-1', createdAt: '2026-07-10' }),
        opportunity({ id: 'opp-2', clientId: 'client-2', createdAt: '2026-07-10' }),
      ],
      invoices: [
        invoice({ id: 'inv-1', opportunityId: 'opp-1', date: '2026-07-11' }),
        invoice({ id: 'inv-2', opportunityId: 'opp-2', date: '2026-07-11' }),
      ],
      clients: [
        client({ id: 'client-1', ownerId: 'advisor-1' }),
        client({ id: 'client-2', ownerId: 'advisor-2' }),
      ],
      selectedAdvisor: 'advisor-2',
      isBoss: true,
      user: user({ id: 'manager-1' }),
      dateRange: { from: new Date(2026, 6, 1), to: new Date(2026, 6, 31) },
      markedOnly: false,
      isDeletionMarked: () => false,
      prefsReady: true,
    });

    expect(result.toCollectInvoices.map((item) => item.id)).toEqual(['inv-2']);
  });

  it('filters and sorts visible payment entries by role and due date', () => {
    const result = getVisiblePayments({
      payments: [
        payment({ id: 'late-2', advisorId: 'advisor-1', dueDate: '2026-07-10' }),
        payment({ id: 'official', advisorId: 'advisor-1', advisorName: 'Vendedor Oficial', dueDate: '2026-07-01' }),
        payment({ id: 'late-1', advisorId: 'advisor-1', dueDate: '2026-07-05' }),
        payment({ id: 'other', advisorId: 'advisor-2', dueDate: '2026-07-03' }),
      ],
      isBoss: false,
      selectedAdvisor: 'all',
      user: user({ id: 'advisor-1' }),
    });

    expect(result.map((item) => item.id)).toEqual(['late-1', 'late-2']);
    expect(result[0].daysLate).toBe(25);
  });

  it('matches billing search terms against payments, invoices and client data', () => {
    const clientsMap = {
      'client-1': client({ id: 'client-1', denominacion: 'Cliente Norte', razonSocial: 'Norte SA' }),
    };
    const opportunitiesMap = {
      'opp-1': opportunity({ id: 'opp-1', clientId: 'client-1' }),
    };

    expect(billingItemMatchesSearch({
      item: payment({ company: 'Aire SRL', comprobanteNumber: 'FAC-123' }),
      searchTerm: 'fac-123',
      clientsMap,
      opportunitiesMap,
    })).toBe(true);

    expect(billingItemMatchesSearch({
      item: invoice({ invoiceNumber: '0000777', opportunityId: 'opp-1' }),
      searchTerm: 'norte',
      clientsMap,
      opportunitiesMap,
    })).toBe(true);

    expect(billingItemMatchesSearch({
      item: opportunity({ id: 'opp-1', clientId: 'client-1' }),
      searchTerm: 'sur',
      clientsMap,
      opportunitiesMap,
    })).toBe(false);
  });

  it('summarizes pending payments by advisor and late-day ranges', () => {
    const result = getPaymentSummaryRows([
      payment({ id: 'p-1', advisorId: 'advisor-1', advisorName: 'Asesor A', daysLate: 15, pendingAmount: 100 }),
      payment({ id: 'p-2', advisorId: 'advisor-1', advisorName: 'Asesor A', daysLate: 45, amount: 200, pendingAmount: undefined }),
      payment({ id: 'p-3', advisorId: 'advisor-2', advisorName: 'Asesor B', daysLate: 75, pendingAmount: 300 }),
      payment({ id: 'p-4', advisorId: 'advisor-2', advisorName: 'Asesor B', daysLate: 100, pendingAmount: 400 }),
      payment({ id: 'paid', advisorId: 'advisor-1', advisorName: 'Asesor A', daysLate: 15, pendingAmount: 999, status: 'Pagado' }),
      payment({ id: 'not-late', advisorId: 'advisor-1', advisorName: 'Asesor A', daysLate: 0, pendingAmount: 999 }),
    ]);

    expect(result).toEqual([
      {
        advisorId: 'advisor-1',
        advisorName: 'Asesor A',
        ranges: { '1-30': 100, '31-60': 200, '61-90': 0, '90+': 0 },
        total: 300,
      },
      {
        advisorId: 'advisor-2',
        advisorName: 'Asesor B',
        ranges: { '1-30': 0, '31-60': 0, '61-90': 300, '90+': 400 },
        total: 700,
      },
    ]);
  });

  it('groups corporate or unassigned payments under Corporativo', () => {
    const result = getPaymentSummaryRows([
      payment({ id: 'corp-name', advisorId: 'corp-id', advisorName: 'CORPORATIVO', daysLate: 20, pendingAmount: 100 }),
      payment({ id: 'mario', advisorId: 'mario-id', advisorName: 'Mario Altamirano', daysLate: 20, pendingAmount: 200 }),
      payment({ id: 'empty-id', advisorId: '', advisorName: 'Sin asignar', daysLate: 20, pendingAmount: 300 }),
    ]);

    expect(result).toEqual([
      {
        advisorId: 'corporativo',
        advisorName: 'Corporativo',
        ranges: { '1-30': 600, '31-60': 0, '61-90': 0, '90+': 0 },
        total: 600,
      },
    ]);
  });
});

const invoice = (overrides: Partial<Invoice>): Invoice => ({
  id: 'invoice-id',
  opportunityId: 'opp-id',
  invoiceNumber: '1',
  date: '2026-07-10',
  amount: 1000,
  status: 'Pendiente',
  ...overrides,
} as Invoice);

const opportunity = (overrides: Partial<Opportunity>): Opportunity => ({
  id: 'opp-id',
  clientId: 'client-id',
  title: 'Oportunidad',
  stage: 'Cerrado - Ganado',
  value: 1000,
  ...overrides,
} as Opportunity);

const client = (overrides: Partial<Client>): Client => ({
  id: 'client-id',
  denominacion: 'Cliente',
  razonSocial: 'Cliente SA',
  ownerId: 'advisor-id',
  ownerName: 'Asesor',
  ...overrides,
} as Client);

const user = (overrides: Partial<User>): User => ({
  id: 'advisor-id',
  name: 'Asesor',
  email: 'asesor@airedesantafe.com.ar',
  role: 'Asesor',
  ...overrides,
} as User);

const payment = (overrides: Partial<PaymentEntry>): PaymentEntry => ({
  id: 'payment-id',
  advisorId: 'advisor-id',
  advisorName: 'Asesor',
  company: 'Aire',
  comprobanteNumber: 'FAC-1',
  razonSocial: 'Cliente SA',
  amount: 1000,
  pendingAmount: 1000,
  dueDate: '2026-07-20',
  issueDate: '2026-07-01',
  status: 'Pendiente',
  createdAt: '2026-07-01',
  ...overrides,
} as PaymentEntry);
