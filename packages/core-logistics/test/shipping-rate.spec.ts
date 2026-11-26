import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  FeatureDisabledError,
  ShippingRateError,
  ShippingRateRule,
  ShippingRateService,
} from '../src/index.js';

const basePkg = {
  id: 'pkg-1',
  weightGrams: 1000,
  quantity: 1,
  fragile: false,
};

function makeRule(overrides: Partial<ShippingRateRule>): ShippingRateRule {
  return {
    schemaVersion: 1,
    id: 'rule-1',
    name: 'Standard',
    currency: 'MXN',
    strategy: 'FLAT',
    baseFeeCents: 5000,
    includedKm: 0,
    volumetricDivisor: 5000,
    active: true,
    ...overrides,
  };
}

describe('ShippingRateService', () => {
  it('calculates FLAT shipping rate in cents', () => {
    const result = ShippingRateService.quote(makeRule({ strategy: 'FLAT', baseFeeCents: 7500 }), {
      currency: 'MXN',
      orderSubtotalCents: 20000,
      packages: [basePkg],
    });

    expect(result.amount.toCents()).toBe(7500);
    expect(result.amount.currency).toBe('MXN');
    expect(result.freeShippingApplied).toBe(false);
  });

  it('applies free shipping when orderSubtotalCents meets threshold', () => {
    const result = ShippingRateService.quote(
      makeRule({ strategy: 'FLAT', baseFeeCents: 7500, freeShippingThresholdCents: 50000 }),
      {
        currency: 'MXN',
        orderSubtotalCents: 50000,
        packages: [basePkg],
      }
    );

    expect(result.amount.toCents()).toBe(0);
    expect(result.freeShippingApplied).toBe(true);
  });

  it('calculates ZONE rate and throws on unknown zone', () => {
    const rule = makeRule({
      strategy: 'ZONE',
      baseFeeCents: 1500,
      zoneRates: [
        { zoneCode: 'NORTE', feeCents: 3500 },
        { zoneCode: 'SUR', feeCents: 4500 },
      ],
    });

    const quote = ShippingRateService.quote(rule, {
      currency: 'MXN',
      orderSubtotalCents: 10000,
      zoneCode: 'norte',
      packages: [basePkg],
    });
    expect(quote.amount.toCents()).toBe(5000);

    expect(() =>
      ShippingRateService.quote(rule, {
        currency: 'MXN',
        orderSubtotalCents: 10000,
        zoneCode: 'ESTE',
        packages: [basePkg],
      })
    ).toThrow(ShippingRateError);
  });

  it('calculates DISTANCE rate with includedKm and half-even rounding', () => {
    const rule = makeRule({
      strategy: 'DISTANCE',
      baseFeeCents: 2500,
      includedKm: 3,
      perKmCents: 505,
    });

    // billableKm = 5.5 - 3 = 2.5 => 505 * 2.5 = 1262.5 => ROUND_HALF_EVEN -> 1262
    const quote = ShippingRateService.quote(rule, {
      currency: 'MXN',
      orderSubtotalCents: 10000,
      distanceKm: 5.5,
      packages: [basePkg],
    });
    expect(quote.amount.toCents()).toBe(2500 + 1262);
  });

  it('calculates WEIGHT rate using volumetric weight when larger than actual weight', () => {
    const rule = makeRule({
      strategy: 'WEIGHT',
      baseFeeCents: 1000,
      volumetricDivisor: 5000,
      weightTiers: [
        { maxWeightGrams: 2000, feeCents: 3000 },
        { maxWeightGrams: 5000, feeCents: 6000 },
      ],
      extraKgCents: 1200,
    });

    // 40 * 30 * 25 / 5000 = 6 kg = 6000g volumetric > 1000g actual
    // exceeds 5000g tier by 1000g -> 1 extra kg => 1000 + 6000 + 1200 = 8200
    const quote = ShippingRateService.quote(rule, {
      currency: 'MXN',
      orderSubtotalCents: 10000,
      packages: [
        {
          id: 'pkg-vol',
          weightGrams: 1000,
          quantity: 1,
          fragile: false,
          dimensionsCm: { lengthCm: 40, widthCm: 30, heightCm: 25 },
        },
      ],
    });

    expect(quote.actualWeightGrams).toBe(1000);
    expect(quote.volumetricWeightGrams).toBe(6000);
    expect(quote.billableWeightGrams).toBe(6000);
    expect(quote.amount.toCents()).toBe(8200);
  });

  it('rejects disabled strategy via feature flags', () => {
    const rule = makeRule({
      strategy: 'ZONE',
      zoneRates: [{ zoneCode: 'CENTRO', feeCents: 2000 }],
    });

    expect(() =>
      ShippingRateService.quote(
        rule,
        {
          currency: 'MXN',
          orderSubtotalCents: 1000,
          zoneCode: 'CENTRO',
          packages: [basePkg],
        },
        { ...DEFAULT_LOGISTICS_FEATURE_FLAGS, enableZoneRates: false }
      )
    ).toThrow(FeatureDisabledError);
  });
});
