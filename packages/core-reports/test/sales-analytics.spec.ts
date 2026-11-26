import { describe, expect, it } from 'vitest';
import {
  buildTimeSeriesReport,
  calculateBpsHalfEven,
  calculateCategoryBreakdown,
  calculateCustomerAnalytics,
  calculateSalesSummary,
  calculateTopItems,
  compareSalesPeriods,
  ReportCurrencyMismatchError,
  ReportFilterSchema,
  ReportPeriodSchema,
  SalesTransactionRecord,
  SalesTransactionRecordSchema,
} from '../src/index.js';

function makeTx(
  overrides: Partial<SalesTransactionRecord> & { id: string }
): SalesTransactionRecord {
  return SalesTransactionRecordSchema.parse({
    occurredAt: '2026-11-10T14:30:00Z',
    currency: 'MXN',
    status: 'COMPLETED',
    grossCents: 10000,
    discountCents: 0,
    taxCents: 1600,
    netCents: 10000,
    costCents: 6000,
    channel: 'POS',
    branchId: 'branch-1',
    payments: [{ method: 'CASH', amountCents: 10000 }],
    lines: [],
    ...overrides,
  });
}

describe('Sales Analytics & Rounding', () => {
  const period = ReportPeriodSchema.parse({
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-30T23:59:59Z',
    granularity: 'DAY',
  });

  const filter = ReportFilterSchema.parse({
    currency: 'MXN',
  });

  it('computes basis points with ROUND_HALF_EVEN', () => {
    // 1 / 8 = 0.125 -> 1250 bps exact
    expect(calculateBpsHalfEven(1, 8)).toBe(1250);
    // 1 / 20000 = 0.00005 -> 0.5 bps -> ties to even = 0
    expect(calculateBpsHalfEven(1, 20000)).toBe(0);
    // 3 / 20000 = 0.00015 -> 1.5 bps -> ties to even = 2
    expect(calculateBpsHalfEven(3, 20000)).toBe(2);
  });

  it('calculates sales summary with refunds, voided exclusion, and exact integer averages', () => {
    const records: SalesTransactionRecord[] = [
      makeTx({
        id: 'tx-1',
        grossCents: 12000,
        discountCents: 2000,
        taxCents: 1379,
        netCents: 10000,
        costCents: 6000,
        channel: 'POS',
        branchId: 'branch-1',
        payments: [{ method: 'CARD', amountCents: 10000 }],
      }),
      makeTx({
        id: 'tx-2',
        grossCents: 5005,
        discountCents: 0,
        taxCents: 690,
        netCents: 5005,
        costCents: 3000,
        channel: 'WEB',
        branchId: 'branch-2',
        payments: [
          { method: 'CASH', amountCents: 2005 },
          { method: 'CARD', amountCents: 3000 },
        ],
      }),
      makeTx({
        id: 'tx-refund',
        status: 'REFUNDED',
        netCents: 2000,
        costCents: 1000,
      }),
      makeTx({
        id: 'tx-voided',
        status: 'VOIDED',
        netCents: 99999,
        costCents: 50000,
      }),
    ];

    const summary = calculateSalesSummary(records, period, filter);

    // Completed: 10000 + 5005 = 15005; Refund: -2000 => net = 13005
    expect(summary.netSalesCents).toBe(13005);
    expect(summary.refundCents).toBe(2000);
    expect(summary.costOfGoodsCents).toBe(8000); // 6000 + 3000 - 1000
    expect(summary.grossProfitCents).toBe(5005); // 13005 - 8000
    expect(summary.transactionCount).toBe(2);
    expect(summary.refundCount).toBe(1);
    expect(summary.voidedCount).toBe(0); // excluded by default filter
    // 13005 / 2 = 6502.5 -> ROUND_HALF_EVEN => 6502
    expect(summary.averageTicketCents).toBe(6502);
    expect(summary.paymentMethods[0]?.method).toBe('CARD');
    expect(summary.paymentMethods[0]?.amountCents).toBe(13000);
    expect(summary.channels).toHaveLength(2);
    expect(summary.branches).toHaveLength(2);
  });

  it('throws ReportCurrencyMismatchError when mixing currencies', () => {
    const records = [
      makeTx({ id: 'tx-1', currency: 'MXN' }),
      makeTx({ id: 'tx-2', currency: 'USD' }),
    ];

    expect(() => calculateSalesSummary(records, period, filter)).toThrow(
      ReportCurrencyMismatchError
    );
  });

  it('builds chronological time-series buckets with timezone offset', () => {
    // 2026-11-10T02:00:00Z with -360 min (UTC-6) is 2026-11-09 20:00 local
    const tzPeriod = ReportPeriodSchema.parse({
      from: '2026-11-09T00:00:00Z',
      to: '2026-11-12T00:00:00Z',
      granularity: 'DAY',
      timezoneOffsetMinutes: -360,
    });

    const records = [
      makeTx({ id: 'tx-1', occurredAt: '2026-11-10T02:00:00Z', netCents: 4000, costCents: 2000 }),
      makeTx({ id: 'tx-2', occurredAt: '2026-11-10T15:00:00Z', netCents: 6000, costCents: 3000 }),
    ];

    const ts = buildTimeSeriesReport(records, tzPeriod, filter);
    expect(ts.buckets).toHaveLength(2);
    expect(ts.buckets[0]?.bucketKey).toBe('2026-11-09');
    expect(ts.buckets[0]?.netSalesCents).toBe(4000);
    expect(ts.buckets[1]?.bucketKey).toBe('2026-11-10');
    expect(ts.buckets[1]?.netSalesCents).toBe(6000);
  });

  it('ranks top items and calculates category breakdown', () => {
    const records = [
      makeTx({
        id: 'tx-1',
        lines: [
          {
            itemId: 'item-a',
            sku: 'SKU-A',
            name: 'Coffee',
            categoryId: 'cat-bev',
            categoryName: 'Beverages',
            quantity: 2,
            unitPriceCents: 2500,
            unitCostCents: 1000,
            discountCents: 0,
            taxCents: 0,
            netTotalCents: 5000,
          },
          {
            itemId: 'item-b',
            sku: 'SKU-B',
            name: 'Croissant',
            categoryId: 'cat-food',
            categoryName: 'Bakery',
            quantity: 3,
            unitPriceCents: 2000,
            unitCostCents: 800,
            discountCents: 0,
            taxCents: 0,
            netTotalCents: 6000,
          },
        ],
      }),
    ];

    const top = calculateTopItems(records, period, filter, 'REVENUE');
    expect(top[0]?.itemId).toBe('item-b');
    expect(top[0]?.grossProfitCents).toBe(3600);

    const categories = calculateCategoryBreakdown(records, period, filter);
    expect(categories).toHaveLength(2);
    expect(categories[0]?.categoryId).toBe('cat-food');
  });

  it('compares two periods and computes customer retention analytics', () => {
    const prevPeriod = ReportPeriodSchema.parse({
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-31T23:59:59Z',
      granularity: 'DAY',
    });

    const currentRecords = [
      makeTx({ id: 'c1', customerId: 'cust-1', netCents: 10000, costCents: 5000 }),
      makeTx({ id: 'c2', customerId: 'cust-1', netCents: 5000, costCents: 2500 }),
      makeTx({ id: 'c3', customerId: 'cust-2', netCents: 5000, costCents: 2500 }),
      makeTx({ id: 'c4', netCents: 3000, costCents: 1500 }), // anonymous
    ];
    const prevRecords = [
      makeTx({
        id: 'p1',
        occurredAt: '2026-10-15T10:00:00Z',
        netCents: 10000,
        costCents: 6000,
      }),
    ];

    const comparison = compareSalesPeriods(
      currentRecords,
      prevRecords,
      period,
      prevPeriod,
      filter
    );
    expect(comparison.netSales.delta).toBe(13000);
    expect(comparison.netSales.deltaBps).toBe(13000); // +130.00%
    expect(comparison.netSales.trend).toBe('UP');

    const customers = calculateCustomerAnalytics(currentRecords, period, filter);
    expect(customers.uniqueCustomers).toBe(2);
    expect(customers.repeatCustomers).toBe(1);
    expect(customers.repeatRateBps).toBe(5000); // 50.00%
    expect(customers.identifiedSalesCents).toBe(20000);
    expect(customers.anonymousSalesCents).toBe(3000);
    expect(customers.averageLtvInPeriodCents).toBe(10000);
  });
});
