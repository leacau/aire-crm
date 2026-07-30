import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeDaysLate,
  getPeriodDurationInMonths,
  isOfficialSellerName,
  normalizeDateForComparison,
  normalizeDateKey,
  parseFlexibleDate,
  parsePastedPayments,
} from '../billing-utils';

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
});
