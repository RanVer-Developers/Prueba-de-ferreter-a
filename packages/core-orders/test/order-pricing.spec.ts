import { describe, expect, it } from 'vitest';
import { OrderPricingService, TaxRule } from '../src/index.js';

const IVA_INCLUSIVE: TaxRule = {
  id: 'tax-iva-inc',
  code: 'IVA',
  name: 'IVA 16% Incluido',
  ratePercent: 16,
  mode: 'INCLUSIVE',
};

const SALES_TAX_EXCLUSIVE: TaxRule = {
  id: 'tax-sales-exc',
  code: 'SALES',
  name: 'Sales Tax 8.25%',
  ratePercent: 8.25,
  mode: 'EXCLUSIVE',
};

const CITY_TAX_EXCLUSIVE: TaxRule = {
  id: 'tax-city-exc',
  code: 'CITY',
  name: 'City Tax 2%',
  ratePercent: 2,
  mode: 'EXCLUSIVE',
};

describe('OrderPricingService', () => {
  it('returns zeroed summary for empty orders', () => {
    const summary = OrderPricingService.calculate({
      currency: 'MXN',
      lines: [],
      orderDiscounts: [],
    });

    expect(summary.total.toCents()).toBe(0);
    expect(summary.netSubtotal.toCents()).toBe(0);
    expect(summary.taxBreakdown).toEqual([]);
    expect(summary.lines).toEqual([]);
  });

  it('calculates exclusive single and multiple taxes accurately', () => {
    const summary = OrderPricingService.calculate({
      currency: 'USD',
      lines: [
        {
          lineId: 'l1',
          quantity: 2,
          unitPriceCents: 1000, // $20.00 gross
          taxes: [SALES_TAX_EXCLUSIVE, CITY_TAX_EXCLUSIVE],
          discounts: [],
        },
      ],
      orderDiscounts: [],
    });

    // 2000 * 8.25% = 165, 2000 * 2% = 40
    expect(summary.grossSubtotal.toCents()).toBe(2000);
    expect(summary.netSubtotal.toCents()).toBe(2000);
    expect(summary.exclusiveTaxTotal.toCents()).toBe(205);
    expect(summary.inclusiveTaxTotal.toCents()).toBe(0);
    expect(summary.total.toCents()).toBe(2205);
    expect(summary.taxBreakdown).toHaveLength(2);
  });

  it('extracts inclusive taxes accurately after line and order discounts', () => {
    const summary = OrderPricingService.calculate({
      currency: 'MXN',
      lines: [
        {
          lineId: 'l1',
          quantity: 1,
          unitPriceCents: 11600, // $116.00 shelf price (100 base + 16 IVA)
          taxes: [IVA_INCLUSIVE],
          discounts: [
            {
              id: 'd-line',
              type: 'PERCENTAGE',
              value: 10, // $11.60 off -> $104.40 payable
            },
          ],
        },
      ],
      orderDiscounts: [],
    });

    expect(summary.grossSubtotal.toCents()).toBe(11600);
    expect(summary.lineDiscountTotal.toCents()).toBe(1160);
    expect(summary.netSubtotal.toCents()).toBe(9000);
    expect(summary.inclusiveTaxTotal.toCents()).toBe(1440);
    expect(summary.total.toCents()).toBe(10440);
    expect(summary.netSubtotal.add(summary.taxTotal).equals(summary.total)).toBe(true);
  });

  it('prorates fixed order discounts across mixed-tax lines to the exact cent', () => {
    const summary = OrderPricingService.calculate({
      currency: 'MXN',
      lines: [
        {
          lineId: 'l1',
          quantity: 1,
          unitPriceCents: 1000,
          taxes: [IVA_INCLUSIVE],
          discounts: [],
        },
        {
          lineId: 'l2',
          quantity: 1,
          unitPriceCents: 1000,
          taxes: [], // 0% tax
          discounts: [],
        },
        {
          lineId: 'l3',
          quantity: 1,
          unitPriceCents: 1000,
          taxes: [CITY_TAX_EXCLUSIVE],
          discounts: [],
        },
      ],
      orderDiscounts: [
        {
          id: 'ord-disc',
          type: 'FIXED_AMOUNT',
          value: 100, // $1.00 across 3 equal lines -> 34 + 33 + 33
        },
      ],
    });

    expect(summary.orderDiscountTotal.toCents()).toBe(100);
    expect(summary.lines[0]!.proratedOrderDiscountAmount.toCents()).toBe(34);
    expect(summary.lines[1]!.proratedOrderDiscountAmount.toCents()).toBe(33);
    expect(summary.lines[2]!.proratedOrderDiscountAmount.toCents()).toBe(33);
    expect(summary.netSubtotal.add(summary.taxTotal).equals(summary.total)).toBe(true);
  });

  it('caps stacked discounts so line and order totals never become negative', () => {
    const summary = OrderPricingService.calculate({
      currency: 'USD',
      lines: [
        {
          lineId: 'l1',
          quantity: 1,
          unitPriceCents: 500,
          taxes: [CITY_TAX_EXCLUSIVE],
          discounts: [
            { id: 'd1', type: 'FIXED_AMOUNT', value: 400 },
            { id: 'd2', type: 'FIXED_AMOUNT', value: 300 },
          ],
        },
      ],
      orderDiscounts: [{ id: 'od1', type: 'FIXED_AMOUNT', value: 1000 }],
    });

    expect(summary.total.toCents()).toBe(0);
    expect(summary.netSubtotal.toCents()).toBe(0);
    expect(summary.discountTotal.toCents()).toBe(500);
  });

  it('supports fractional quantities with exact half-even rounding', () => {
    const summary = OrderPricingService.calculate({
      currency: 'USD',
      lines: [
        {
          lineId: 'l1',
          quantity: 1.255, // 1.255 * 1000 = 1255 cents
          unitPriceCents: 1000,
          taxes: [],
          discounts: [],
        },
      ],
      orderDiscounts: [],
    });

    expect(summary.total.toCents()).toBe(1255);
  });
});
