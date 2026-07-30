import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeDaysLate,
  getDuplicateInvoiceGroups,
  getPeriodDurationInMonths,
  isOfficialSellerName,
  normalizeDateForComparison,
  normalizeDateKey,
  parseFlexibleDate,
  parsePastedPayments,
} from '../billing-utils';
import type { Invoice, Opportunity } from '../types';

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
