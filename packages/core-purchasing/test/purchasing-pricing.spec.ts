import { describe, expect, it } from 'vitest';
import {
  InvalidPurchasingInputError,
  calculatePurchasingLineTotals,
  calculateWeightedAverageCostCents,
  sumDocumentTotals,
} from '../src/index.js';

describe('purchasing-pricing.service', () => {
  it('computes exact line totals in cents with packSize and 16% tax', () => {
    const result = calculatePurchasingLineTotals({
      quantity: 2, // 2 boxes
      packSize: 12, // 12 units per box => 24 base units
      unitCostCents: 120_00, // $120.00 per box
      discountCents: 0,
      taxRateBps: 1600, // 16%
    });

    expect(result.lineSubtotalCents).toBe(240_00);
    expect(result.lineTaxCents).toBe(38_40);
    expect(result.lineTotalCents).toBe(278_40);
    expect(result.baseUnits).toBe(24);
    expect(result.baseUnitCostCents).toBe(10_00); // $10.00 per base unit
  });

  it('applies line discount before tax and computes net baseUnitCostCents', () => {
    const result = calculatePurchasingLineTotals({
      quantity: 1,
      packSize: 10,
      unitCostCents: 10_000,
      discountCents: 1_000,
      taxRateBps: 1600,
    });

    expect(result.netSubtotalCents).toBe(9_000);
    expect(result.lineTaxCents).toBe(1_440);
    expect(result.lineTotalCents).toBe(10_440);
    expect(result.baseUnitCostCents).toBe(900);
  });

  it('uses ROUND_HALF_EVEN for fractional quantities and odd half-cents', () => {
    const result = calculatePurchasingLineTotals({
      quantity: 1.5,
      packSize: 1,
      unitCostCents: 101, // 1.5 * 101 = 151.5 -> 152 (half to even)
      discountCents: 0,
      taxRateBps: 0,
    });

    expect(result.lineSubtotalCents).toBe(152);
  });

  it('rejects discount exceeding subtotal', () => {
    expect(() =>
      calculatePurchasingLineTotals({
        quantity: 1,
        packSize: 1,
        unitCostCents: 500,
        discountCents: 600,
        taxRateBps: 0,
      }),
    ).toThrow(InvalidPurchasingInputError);
  });

  it('sums document totals accurately', () => {
    const totals = sumDocumentTotals([
      { lineSubtotalCents: 1000, discountCents: 100, lineTaxCents: 144, lineTotalCents: 1044 },
      { lineSubtotalCents: 2000, discountCents: 0, lineTaxCents: 320, lineTotalCents: 2320 },
    ]);

    expect(totals).toEqual({
      subtotalCents: 3000,
      discountCents: 100,
      taxCents: 464,
      totalCents: 3364,
    });
  });

  it('calculates weighted average unit cost', () => {
    const avg = calculateWeightedAverageCostCents({
      existingStockUnits: 10,
      existingUnitCostCents: 1000,
      receivedUnits: 10,
      receivedUnitCostCents: 1200,
    });
    expect(avg).toBe(1100);
  });
});
