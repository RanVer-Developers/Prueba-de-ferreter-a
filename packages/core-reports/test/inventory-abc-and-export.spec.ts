import { describe, expect, it } from 'vitest';
import {
  calculateAbcParetoReport,
  escapeCsvCell,
  formatTabularExport,
  InventorySnapshotRecord,
  InventorySnapshotRecordSchema,
  ReportCurrencyMismatchError,
} from '../src/index.js';

function makeSnap(
  overrides: Partial<InventorySnapshotRecord> & { itemId: string; name: string }
): InventorySnapshotRecord {
  return InventorySnapshotRecordSchema.parse({
    currency: 'MXN',
    quantityOnHand: 10,
    unitCostCents: 1000,
    totalValueCents: 10000,
    unitsSoldInPeriod: 5,
    revenueInPeriodCents: 10000,
    profitInPeriodCents: 4000,
    ...overrides,
  });
}

describe('Inventory ABC Pareto & Safe Export', () => {
  it('classifies items into A (<=80%), B (<=95%), and C (>95%) by revenue', () => {
    const snapshots: InventorySnapshotRecord[] = [
      makeSnap({ itemId: 'i1', name: 'Star Product', revenueInPeriodCents: 75000 }),
      makeSnap({ itemId: 'i2', name: 'Mid Product', revenueInPeriodCents: 18000 }),
      makeSnap({ itemId: 'i3', name: 'Tail Product 1', revenueInPeriodCents: 5000 }),
      makeSnap({ itemId: 'i4', name: 'Tail Product 2', revenueInPeriodCents: 2000 }),
    ];

    const report = calculateAbcParetoReport(snapshots, 'MXN', 'REVENUE');

    expect(report.totalMetricValueCents).toBe(100000);
    expect(report.items[0]?.abcClass).toBe('A'); // 75%
    expect(report.items[1]?.abcClass).toBe('A'); // prev cumulative 75% < 80% -> A (brings to 93%)
    expect(report.items[2]?.abcClass).toBe('B'); // prev cumulative 93% < 95% -> B (brings to 98%)
    expect(report.items[3]?.abcClass).toBe('C'); // prev cumulative 98% >= 95% -> C
    expect(report.classCounts).toEqual({ A: 2, B: 1, C: 1 });
  });

  it('throws ReportCurrencyMismatchError on mixed snapshot currencies', () => {
    const snapshots = [
      makeSnap({ itemId: 'i1', name: 'Item 1', currency: 'MXN' }),
      makeSnap({ itemId: 'i2', name: 'Item 2', currency: 'USD' }),
    ];

    expect(() => calculateAbcParetoReport(snapshots, 'MXN')).toThrow(
      ReportCurrencyMismatchError
    );
  });

  it('neutralizes CSV formula injection and escapes RFC 4180 special characters', () => {
    expect(escapeCsvCell('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`);
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");
    expect(escapeCsvCell('-2*3')).toBe("'-2*3");
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell('Coffee, Large')).toBe('"Coffee, Large"');
    expect(escapeCsvCell(1250)).toBe('1250');
  });

  it('formats CSV and JSON exports cleanly', () => {
    const dataset = {
      columns: ['SKU', 'Name', 'RevenueCents'],
      rows: [
        ['SKU-1', '=EVIL()', 5000],
        ['SKU-2', 'Latte, Oat', 3500],
      ],
    };

    const csv = formatTabularExport(dataset, 'CSV', 'sales report!', '2026-11-23T12:00:00Z');
    expect(csv.filename).toBe('sales_report_.csv');
    expect(csv.rowCount).toBe(2);
    expect(csv.content).toBe(
      "SKU,Name,RevenueCents\r\nSKU-1,'=EVIL(),5000\r\nSKU-2,\"Latte, Oat\",3500"
    );

    const json = formatTabularExport(dataset, 'JSON', 'sales_report', '2026-11-23T12:00:00Z');
    expect(json.filename).toBe('sales_report.json');
    const parsed = JSON.parse(json.content);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.data[1].Name).toBe('Latte, Oat');
  });
});
