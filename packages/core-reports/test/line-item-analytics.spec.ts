import { describe, expect, it } from 'vitest';
import {
  ReportFilterSchema,
  ReportPeriodSchema,
  SalesTransactionRecordSchema,
  calculateLineItemMarginReport,
} from '../src/index.js';

describe('@modulos/core-reports line-item margin analytics', () => {
  it('computes net revenue, cost, gross profit, and margin bps per item using ROUND_HALF_EVEN', () => {
    const period = ReportPeriodSchema.parse({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });
    const filter = ReportFilterSchema.parse({ currency: 'MXN' });

    const txs = [
      SalesTransactionRecordSchema.parse({
        id: 'tx-1',
        occurredAt: '2026-10-10T10:00:00.000Z',
        currency: 'MXN',
        status: 'COMPLETED',
        grossCents: 100_000,
        netCents: 100_000,
        costCents: 60_000,
        lines: [
          {
            itemId: 'item-cem',
            sku: 'CEM-50',
            name: 'Cemento Gris 50kg',
            quantity: 4,
            unitPriceCents: 25_000,
            unitCostCents: 15_000,
            netTotalCents: 100_000,
          },
        ],
      }),
      SalesTransactionRecordSchema.parse({
        id: 'tx-2',
        occurredAt: '2026-10-12T10:00:00.000Z',
        currency: 'MXN',
        status: 'REFUNDED',
        grossCents: 25_000,
        netCents: 25_000,
        costCents: 15_000,
        lines: [
          {
            itemId: 'item-cem',
            sku: 'CEM-50',
            name: 'Cemento Gris 50kg',
            quantity: 1,
            unitPriceCents: 25_000,
            unitCostCents: 15_000,
            netTotalCents: 25_000,
          },
        ],
      }),
    ];

    const report = calculateLineItemMarginReport(txs, period, filter);
    expect(report.totalNetRevenueCents).toBe(75_000);
    expect(report.totalCostCents).toBe(45_000);
    expect(report.totalGrossProfitCents).toBe(30_000);
    expect(report.overallMarginBps).toBe(4_000); // 40.00%
    expect(report.items[0]?.quantitySold).toBe(3);
  });
});
