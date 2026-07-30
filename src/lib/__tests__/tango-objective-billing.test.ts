import { describe, expect, it } from 'vitest';
import { summarizeTangoObjectiveBilling, type TangoObjectiveInvoice } from '../tango-objective-billing';
import type { User } from '../types';

const invoice = (overrides: Partial<TangoObjectiveInvoice>): TangoObjectiveInvoice => ({
  FECHA_DE_EMISION: '2026-07-10T00:00:00',
  TIPO_COMPROBANTE: 'FAC',
  COD_VENDEDOR: '00012',
  NOMBRE_VENDEDOR: 'Vendedor Aire',
  TOTAL: 1000,
  _companyId: '5',
  _companyLabel: 'Aire SRL',
  ...overrides,
});

describe('summarizeTangoObjectiveBilling', () => {
  it('sums valid FAC invoices in the requested range and maps advisors by company/code', () => {
    const advisors = [{
      id: 'advisor-1',
      sellerConfig: [{
        companyName: 'Aire SRL',
        codes: ['12'],
      }],
    }] as User[];

    const result = summarizeTangoObjectiveBilling([
      invoice({ TOTAL: 1000 }),
      invoice({ TOTAL: 2500, FECHA_DE_EMISION: '2026-07-25T00:00:00' }),
    ], new Date(2026, 6, 1), new Date(2026, 6, 31), advisors);

    expect(result.total).toBe(3500);
    expect(result.count).toBe(2);
    expect(result.byAdvisor['advisor-1']).toEqual({ total: 3500, count: 2 });
  });

  it('ignores non FAC invoices, official sellers, out-of-range dates and invalid totals', () => {
    const result = summarizeTangoObjectiveBilling([
      invoice({ TIPO_COMPROBANTE: 'N/C', TOTAL: -500 }),
      invoice({ NOMBRE_VENDEDOR: 'VENDEDOR OFICIAL', TOTAL: 3000 }),
      invoice({ FECHA_DE_EMISION: '2026-08-01T00:00:00', TOTAL: 4000 }),
      invoice({ TOTAL: 'no-number' as unknown as number }),
      invoice({ TOTAL: 700 }),
    ], new Date(2026, 6, 1), new Date(2026, 6, 31));

    expect(result).toEqual({ total: 700, count: 1, byAdvisor: {} });
  });
});
