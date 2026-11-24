import { divideHalfEven, multiplyCentsHalfEven, normalizeCurrencyCode } from '@modulos/core-shared';
import type { ReportFilter, ReportPeriod, SalesTransactionRecord } from '../../schemas/report-schemas.js';
import { calculateBpsHalfEven, filterSalesTransactions } from './sales-analytics.service.js';

export interface LineItemMarginMetric {
  readonly itemId: string;
  readonly sku?: string;
  readonly name: string;
  readonly categoryId?: string;
  readonly quantitySold: number;
  readonly grossRevenueCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly netRevenueCents: number;
  readonly totalCostCents: number;
  readonly grossProfitCents: number;
  readonly grossMarginBps: number;
  readonly revenueShareBps: number;
}

export interface LineItemMarginReport {
  readonly currency: string;
  readonly period: ReportPeriod;
  readonly totalNetRevenueCents: number;
  readonly totalCostCents: number;
  readonly totalGrossProfitCents: number;
  readonly overallMarginBps: number;
  readonly items: LineItemMarginMetric[];
}

export function calculateLineItemMarginReport(
  transactions: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter,
): LineItemMarginReport {
  const currency = normalizeCurrencyCode(filter.currency);
  const filtered = filterSalesTransactions(transactions, period, filter);

  const buckets = new Map<
    string,
    {
      itemId: string;
      sku?: string;
      name: string;
      categoryId?: string;
      quantitySold: number;
      grossRevenueCents: number;
      discountCents: number;
      taxCents: number;
      netRevenueCents: number;
      totalCostCents: number;
    }
  >();

  let totalNetRevenueCents = 0;
  let totalCostCents = 0;

  for (const tx of filtered) {
    if (tx.status === 'VOIDED') continue;
    const sign = tx.status === 'REFUNDED' ? -1 : 1;

    for (const line of tx.lines) {
      if (filter.categoryIds?.length && (!line.categoryId || !filter.categoryIds.includes(line.categoryId))) {
        continue;
      }

      const lineCost = multiplyCentsHalfEven(line.unitCostCents, line.quantity) * sign;
      const lineGross = multiplyCentsHalfEven(line.unitPriceCents, line.quantity) * sign;
      const lineNet = line.netTotalCents * sign;
      const lineDisc = line.discountCents * sign;
      const lineTax = line.taxCents * sign;
      const qtyDelta = line.quantity * sign;

      totalNetRevenueCents += lineNet;
      totalCostCents += lineCost;

      const existing = buckets.get(line.itemId);
      if (existing) {
        existing.quantitySold += qtyDelta;
        existing.grossRevenueCents += lineGross;
        existing.discountCents += lineDisc;
        existing.taxCents += lineTax;
        existing.netRevenueCents += lineNet;
        existing.totalCostCents += lineCost;
      } else {
        buckets.set(line.itemId, {
          itemId: line.itemId,
          sku: line.sku,
          name: line.name,
          categoryId: line.categoryId,
          quantitySold: qtyDelta,
          grossRevenueCents: lineGross,
          discountCents: lineDisc,
          taxCents: lineTax,
          netRevenueCents: lineNet,
          totalCostCents: lineCost,
        });
      }
    }
  }

  const totalGrossProfitCents = totalNetRevenueCents - totalCostCents;
  const overallMarginBps =
    totalNetRevenueCents > 0
      ? divideHalfEven(BigInt(totalGrossProfitCents) * 10_000n, BigInt(totalNetRevenueCents))
      : 0;

  const items: LineItemMarginMetric[] = Array.from(buckets.values())
    .map((b) => {
      const grossProfitCents = b.netRevenueCents - b.totalCostCents;
      const grossMarginBps =
        b.netRevenueCents > 0
          ? divideHalfEven(BigInt(grossProfitCents) * 10_000n, BigInt(b.netRevenueCents))
          : 0;
      const revenueShareBps =
        totalNetRevenueCents > 0
          ? calculateBpsHalfEven(b.netRevenueCents, totalNetRevenueCents)
          : 0;

      return {
        ...b,
        grossProfitCents,
        grossMarginBps,
        revenueShareBps,
      };
    })
    .sort((a, b) => b.netRevenueCents - a.netRevenueCents)
    .slice(0, filter.topLimit);

  return {
    currency,
    period,
    totalNetRevenueCents,
    totalCostCents,
    totalGrossProfitCents,
    overallMarginBps,
    items,
  };
}
