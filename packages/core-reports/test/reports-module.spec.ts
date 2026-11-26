import { describe, expect, it } from 'vitest';
import {
  buildInventorySnapshotsFromSales,
  calculateAbcParetoReport,
  createReportsModule,
} from '../src/index.js';

describe('createReportsModule facade', () => {
  it('resolves flat feature flags and saves/lists report definitions without external dataSource', async () => {
    const mod = createReportsModule({ featureProfile: 'INTERMEDIATE' });
    expect(mod.features.dataExport).toBe(true);
    expect(mod.features.abcParetoAnalytics).toBe(false);

    const def = await mod.saveDefinition({
      id: 'rep-sales-daily',
      name: 'Ventas Diarias',
      type: 'SALES_SUMMARY',
      filter: {
        currency: 'MXN',
        includeVoided: false,
        includeRefunded: true,
        topLimit: 20,
      },
    });
    expect(def.id).toBe('rep-sales-daily');
    expect(await mod.listDefinitions()).toHaveLength(1);
  });

  it('flags hasZeroMetricData on empty sales and populates ABC snapshots accurately from real sales', () => {
    const baseStock = [
      { itemId: 'sku-a', sku: 'A', name: 'Prod A', currency: 'MXN', quantityOnHand: 10, unitCostCents: 1000 },
      { itemId: 'sku-b', sku: 'B', name: 'Prod B', currency: 'MXN', quantityOnHand: 10, unitCostCents: 1000 },
      { itemId: 'sku-c', sku: 'C', name: 'Prod C', currency: 'MXN', quantityOnHand: 10, unitCostCents: 1000 },
    ];

    const emptySnapshots = buildInventorySnapshotsFromSales(baseStock, []);
    const zeroReport = calculateAbcParetoReport(emptySnapshots, 'MXN', 'REVENUE');
    expect(zeroReport.hasZeroMetricData).toBe(true);
    expect(zeroReport.classCounts).toEqual({ A: 0, B: 0, C: 3 });

    const populated = buildInventorySnapshotsFromSales(baseStock, [
      {
        schemaVersion: 1,
        id: 'tx-1',
        channel: 'POS',
        occurredAt: '2026-11-24T10:00:00.000Z',
        currency: 'MXN',
        status: 'COMPLETED',
        grossCents: 100_000,
        discountCents: 0,
        taxCents: 16_000,
        netCents: 100_000,
        costCents: 50_000,
        payments: [],
        lines: [
          { itemId: 'sku-a', name: 'Prod A', quantity: 10, unitPriceCents: 8_500, unitCostCents: 5_000, discountCents: 0, taxCents: 13_600, netTotalCents: 85_000 },
          { itemId: 'sku-b', name: 'Prod B', quantity: 2, unitPriceCents: 6_000, unitCostCents: 3_000, discountCents: 0, taxCents: 1_920, netTotalCents: 12_000 },
          { itemId: 'sku-c', name: 'Prod C', quantity: 1, unitPriceCents: 3_000, unitCostCents: 1_500, discountCents: 0, taxCents: 480, netTotalCents: 3_000 },
        ],
      },
    ]);

    const realReport = calculateAbcParetoReport(populated, 'MXN', 'REVENUE');
    expect(realReport.hasZeroMetricData).toBe(false);
    expect(realReport.classCounts).toEqual({ A: 1, B: 1, C: 1 });
  });
});
