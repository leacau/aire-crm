import { describe, expect, it } from 'vitest';

import { normalizeTangoInvoice, parseTangoTotal } from './tango-invoice-utils';

describe('parseTangoTotal', () => {
  it('accepts numeric values', () => {
    expect(parseTangoTotal(33333.33)).toBe(33333.33);
  });

  it('accepts Tango decimal strings', () => {
    expect(parseTangoTotal('33333.330000')).toBe(33333.33);
  });

  it('accepts Argentine formatted strings', () => {
    expect(parseTangoTotal('33.333,33')).toBe(33333.33);
  });

  it('returns null for non numeric values', () => {
    expect(parseTangoTotal('sin dato')).toBeNull();
  });
});

describe('normalizeTangoInvoice', () => {
  it('normalizes alternate Tango field names', () => {
    expect(normalizeTangoInvoice({
      DESC_TIPO_COMPROBANTE: 'FAC',
      CODIGO_CLIENTE: '0001',
      COD_VEND: '020',
      VENDEDOR_NOMBRE: 'Mario',
      TOTAL: '100.50',
    })).toMatchObject({
      TIPO_COMPROBANTE: 'FAC',
      COD_CLIENTE: '0001',
      COD_VENDEDOR: '020',
      NOMBRE_VENDEDOR: 'Mario',
      TOTAL: 100.5,
    });
  });
});
