import { describe, expect, it } from 'vitest';
import {
  advertisingOrderSupportsExecution,
  getAdvertisingOrderFinancialSummary,
  getSuggestedSocialMediaType,
} from '../advertising-order-utils';

describe('getAdvertisingOrderFinancialSummary', () => {
  it('calculates SRL spots and SAS banners with adjustments', () => {
    const result = getAdvertisingOrderFinancialSummary({
      adjustmentSrl: 100,
      adjustmentSas: 50,
      srlItems: [{
        adType: 'Spot',
        seconds: 10,
        unitRate: 20,
        dailySpots: {
          '2026-07-01': 2,
          '2026-07-02': 3,
        },
      }],
      sasItems: [{
        format: 'Banner',
        cpm: 10,
        unitRate: 30,
      }],
    });

    expect(result).toEqual({
      srl: { gross: 1000, adjustment: 100, net: 900 },
      sas: { gross: 300, adjustment: 50, net: 250 },
    });
  });
});

describe('advertisingOrderSupportsExecution', () => {
  it('detects commercial notes, social media and web-note executions from order text', () => {
    expect(advertisingOrderSupportsExecution({
      srlItems: [{ adType: 'Nota comercial' }],
    }, 'commercial-note')).toBe(true);

    expect(advertisingOrderSupportsExecution({
      sasItems: [{ format: 'Redes', type: 'Story Instagram' }],
    }, 'social-media')).toBe(true);

    expect(advertisingOrderSupportsExecution({
      sasItems: [{ detail: 'Nota web con gacetilla' }],
    }, 'web-note')).toBe(true);
  });
});

describe('getSuggestedSocialMediaType', () => {
  it('suggests the most specific social media type found in the items', () => {
    expect(getSuggestedSocialMediaType([
      { format: 'Redes sociales', type: 'Historia de Instagram' },
    ])).toBe('Story');

    expect(getSuggestedSocialMediaType([
      { format: 'Redes sociales', type: 'Carrusel' },
    ])).toBe('Carrusel');

    expect(getSuggestedSocialMediaType([
      { format: 'Redes sociales', type: 'Reel' },
    ])).toBe('Reel');
  });
});
