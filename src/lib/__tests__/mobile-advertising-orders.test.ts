import { describe, expect, it } from 'vitest';
import {
  toMobileAdvertisingOrderDetail,
  toMobileAdvertisingOrderSummary,
} from '../mobile-advertising-orders';
import type { AdvertisingOrder } from '../types';

describe('mobile-advertising-orders', () => {
  it('maps advertising orders into a compact mobile summary', () => {
    const summary = toMobileAdvertisingOrderSummary(order({
      totalSrl: 1000,
      totalSas: 2000,
      totalOrder: 3000,
      status: 'Aprobado',
    }));

    expect(summary).toMatchObject({
      id: 'order-1',
      title: 'Campana institucional',
      clientName: 'Cliente SA',
      status: 'Aprobado',
      totalSrl: 1000,
      totalSas: 2000,
      totalOrder: 3000,
      srlItemCount: 1,
      sasItemCount: 1,
      billingRequestCount: 2,
      hasMaterial: true,
    });
  });

  it('maps detail items and billing requests for mobile order detail', () => {
    const detail = toMobileAdvertisingOrderDetail(order(), {
      programNamesById: new Map([['program-1', 'Programa Manana']]),
    });

    expect(detail.srlItems).toEqual([
      {
        month: '2026-07',
        programId: 'program-1',
        programName: 'Programa Manana',
        type: 'Spot',
        seconds: 15,
        repetitions: 3,
        unitRate: 100,
      },
    ]);
    expect(detail.sasItems[0]).toMatchObject({
      month: '2026-07',
      format: 'Banner',
      type: 'Home',
      unitRate: 200,
    });
    expect(detail.billingRequests.srl).toHaveLength(1);
    expect(detail.billingRequests.sas).toHaveLength(1);
  });
});

function order(overrides: Partial<AdvertisingOrder> = {}): AdvertisingOrder {
  return {
    id: 'order-1',
    clientId: 'client-1',
    clientName: 'Cliente SA',
    product: 'Campana institucional',
    accountExecutive: 'Asesor A',
    createdAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'user-1',
    opportunityId: 'opportunity-1',
    opportunityTitle: 'Oportunidad',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    materialSent: true,
    materialUrl: 'https://example.com/material.pdf',
    certReq: false,
    agencySale: false,
    commissionSrl: 0,
    adjustmentSrl: 0,
    adjustmentSas: 0,
    srlItems: [
      {
        month: '2026-07',
        programId: 'program-1',
        adType: 'Spot',
        seconds: 15,
        dailySpots: { monday: 2, tuesday: 1 },
        unitRate: 100,
      },
    ],
    sasItems: [
      {
        month: '2026-07',
        format: 'Banner',
        detail: 'Home',
        unitRate: 200,
      },
    ],
    billingRequestsSrl: [
      { date: '2026-07-15', grossAmount: 1000, adjustment: 0, amount: 1000, paymentType: 'Se paga' },
    ],
    billingRequestsSas: [
      { date: '2026-07-20', grossAmount: 2000, adjustment: 0, amount: 2000, paymentType: 'Canje' },
    ],
    ...overrides,
  };
}
