import { normalizeCurrencyCode, roundHalfEven } from '@modulos/core-shared';
import { ReportCurrencyMismatchError } from '../errors/report-errors.js';
import {
  InventorySnapshotRecord,
  REPORTS_SCHEMA_VERSION,
  SalesTransactionRecord,
} from '../../schemas/report-schemas.js';
import { calculateBpsHalfEven } from './sales-analytics.service.js';

export type AbcClass = 'A' | 'B' | 'C';
export type AbcMetric = 'REVENUE' | 'PROFIT' | 'VALUATION';

export interface AbcParetoItem {
  itemId: string;
  sku?: string;
  name: string;
  categoryId?: string;
  quantityOnHand: number;
  totalValueCents: number;
  unitsSoldInPeriod: number;
  metricValueCents: number;
  shareBps: number;
  cumulativeShareBps: number;
  abcClass: AbcClass;
}

export interface AbcParetoReport {
  currency: string;
  metric: AbcMetric;
  totalMetricValueCents: number;
  totalInventoryValueCents: number;
  hasZeroMetricData: boolean;
  classCounts: Record<AbcClass, number>;
  items: AbcParetoItem[];
}

export interface InventoryStockBaseInput {
  itemId: string;
  sku?: string;
  name: string;
  categoryId?: string;
  branchId?: string;
  currency: string;
  quantityOnHand: number;
  unitCostCents: number;
  totalValueCents?: number;
}

/**
 * Classifies inventory items into A (<= 80%), B (<= 95%), and C (> 95%) using Pareto analysis.
 * Enforces strict currency consistency and uses integer basis points (ROUND_HALF_EVEN).
 */
export function calculateAbcParetoReport(
  snapshots: ReadonlyArray<InventorySnapshotRecord>,
  targetCurrency: string,
  metric: AbcMetric = 'REVENUE'
): AbcParetoReport {
  const currency = normalizeCurrencyCode(targetCurrency);

  const normalized = snapshots.map((snap) => {
    const snapCurrency = normalizeCurrencyCode(snap.currency);
    if (snapCurrency !== currency) {
      throw new ReportCurrencyMismatchError(currency, snapCurrency);
    }

    const metricValueCents =
      metric === 'PROFIT'
        ? Math.max(0, snap.profitInPeriodCents)
        : metric === 'VALUATION'
          ? snap.totalValueCents
          : snap.revenueInPeriodCents;

    return {
      snap,
      metricValueCents,
    };
  });

  normalized.sort((a, b) => b.metricValueCents - a.metricValueCents);

  const totalMetricValueCents = normalized.reduce((sum, x) => sum + x.metricValueCents, 0);
  const totalInventoryValueCents = normalized.reduce(
    (sum, x) => sum + x.snap.totalValueCents,
    0
  );

  const classCounts: Record<AbcClass, number> = { A: 0, B: 0, C: 0 };
  let runningMetricSum = 0;

  const items: AbcParetoItem[] = normalized.map(({ snap, metricValueCents }) => {
    runningMetricSum += metricValueCents;

    const shareBps =
      totalMetricValueCents > 0
        ? calculateBpsHalfEven(metricValueCents, totalMetricValueCents)
        : 0;
    const cumulativeShareBps =
      totalMetricValueCents > 0
        ? calculateBpsHalfEven(runningMetricSum, totalMetricValueCents)
        : 0;

    let abcClass: AbcClass = 'C';
    if (totalMetricValueCents > 0 && metricValueCents > 0) {
      const previousCumulativeBps = cumulativeShareBps - shareBps;
      if (previousCumulativeBps < 8000) {
        abcClass = 'A';
      } else if (previousCumulativeBps < 9500) {
        abcClass = 'B';
      }
    }

    classCounts[abcClass] += 1;

    return {
      itemId: snap.itemId,
      sku: snap.sku,
      name: snap.name,
      categoryId: snap.categoryId,
      quantityOnHand: snap.quantityOnHand,
      totalValueCents: snap.totalValueCents,
      unitsSoldInPeriod: snap.unitsSoldInPeriod,
      metricValueCents,
      shareBps,
      cumulativeShareBps,
      abcClass,
    };
  });

  return {
    currency,
    metric,
    totalMetricValueCents,
    totalInventoryValueCents,
    hasZeroMetricData: items.length > 0 && totalMetricValueCents === 0,
    classCounts,
    items,
  };
}

/**
 * Builds InventorySnapshotRecord entries enriched with real units sold, revenue, and profit from period sales.
 */
export function buildInventorySnapshotsFromSales(
  stockItems: ReadonlyArray<InventoryStockBaseInput>,
  transactions: ReadonlyArray<SalesTransactionRecord>,
  options: { includeRefunded?: boolean } = {}
): InventorySnapshotRecord[] {
  const byItemId = new Map<string, { units: number; revenueCents: number; profitCents: number }>();

  for (const tx of transactions) {
    if (tx.status === 'VOIDED') continue;
    if (tx.status === 'REFUNDED' && !options.includeRefunded) continue;

    for (const line of tx.lines) {
      const prev = byItemId.get(line.itemId) ?? { units: 0, revenueCents: 0, profitCents: 0 };
      const lineCostCents = roundHalfEven(line.unitCostCents * line.quantity);
      const lineNetRevenueCents = line.netTotalCents - line.taxCents;
      byItemId.set(line.itemId, {
        units: prev.units + line.quantity,
        revenueCents: prev.revenueCents + lineNetRevenueCents,
        profitCents: prev.profitCents + (lineNetRevenueCents - lineCostCents),
      });
    }
  }

  return stockItems.map((stock) => {
    const agg = byItemId.get(stock.itemId) ?? { units: 0, revenueCents: 0, profitCents: 0 };
    const totalValueCents =
      stock.totalValueCents ?? roundHalfEven(stock.unitCostCents * stock.quantityOnHand);
    return {
      schemaVersion: REPORTS_SCHEMA_VERSION,
      itemId: stock.itemId,
      sku: stock.sku,
      name: stock.name,
      categoryId: stock.categoryId,
      branchId: stock.branchId,
      currency: normalizeCurrencyCode(stock.currency),
      quantityOnHand: stock.quantityOnHand,
      unitCostCents: stock.unitCostCents,
      totalValueCents,
      unitsSoldInPeriod: agg.units,
      revenueInPeriodCents: Math.max(0, agg.revenueCents),
      profitInPeriodCents: agg.profitCents,
    };
  });
}
