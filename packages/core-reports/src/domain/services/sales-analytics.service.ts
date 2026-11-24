import { divideHalfEven, normalizeCurrencyCode } from '@modulos/core-shared';
import {
  InvalidReportPeriodError,
  ReportCurrencyMismatchError,
} from '../errors/report-errors.js';
import {
  ReportFilter,
  ReportGranularity,
  ReportPeriod,
  SalesTransactionRecord,
} from '../../schemas/report-schemas.js';

export interface PaymentMethodSummary {
  method: string;
  amountCents: number;
  transactionCount: number;
  shareBps: number;
}

export interface DimensionBreakdownItem {
  key: string;
  netSalesCents: number;
  grossProfitCents: number;
  transactionCount: number;
  shareBps: number;
}

export interface SalesSummaryReport {
  currency: string;
  period: ReportPeriod;
  grossSalesCents: number;
  discountCents: number;
  taxCents: number;
  netSalesCents: number;
  refundCents: number;
  costOfGoodsCents: number;
  grossProfitCents: number;
  grossMarginBps: number;
  transactionCount: number;
  refundCount: number;
  voidedCount: number;
  averageTicketCents: number;
  paymentMethods: PaymentMethodSummary[];
  channels: DimensionBreakdownItem[];
  branches: DimensionBreakdownItem[];
}

export interface TimeSeriesBucket {
  bucketKey: string;
  bucketStartIso: string;
  netSalesCents: number;
  grossProfitCents: number;
  taxCents: number;
  discountCents: number;
  transactionCount: number;
  averageTicketCents: number;
}

export interface TimeSeriesReport {
  currency: string;
  granularity: ReportGranularity;
  period: ReportPeriod;
  buckets: TimeSeriesBucket[];
}

export interface TopItemMetric {
  itemId: string;
  sku?: string;
  name: string;
  categoryId?: string;
  quantitySold: number;
  netSalesCents: number;
  costCents: number;
  grossProfitCents: number;
  grossMarginBps: number;
  shareBps: number;
}

export interface CategoryBreakdownMetric {
  categoryId: string;
  categoryName: string;
  quantitySold: number;
  netSalesCents: number;
  costCents: number;
  grossProfitCents: number;
  grossMarginBps: number;
  shareBps: number;
}

export type ComparisonTrend = 'UP' | 'DOWN' | 'FLAT';

export interface MetricDelta {
  current: number;
  previous: number;
  delta: number;
  deltaBps: number;
  trend: ComparisonTrend;
}

export interface PeriodComparisonReport {
  currency: string;
  currentPeriod: ReportPeriod;
  previousPeriod: ReportPeriod;
  netSales: MetricDelta;
  grossProfit: MetricDelta;
  transactionCount: MetricDelta;
  averageTicket: MetricDelta;
}

export interface CustomerAnalyticsReport {
  currency: string;
  period: ReportPeriod;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatRateBps: number;
  identifiedSalesCents: number;
  anonymousSalesCents: number;
  averageLtvInPeriodCents: number;
  topCustomers: Array<{
    customerId: string;
    orderCount: number;
    netSalesCents: number;
    averageTicketCents: number;
  }>;
}

/**
 * Computes basis points (10000 = 100.00%) using ROUND_HALF_EVEN.
 */
export function calculateBpsHalfEven(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(divideHalfEven(BigInt(numerator) * 10000n, BigInt(denominator)));
}

/**
 * Filters transactions by period, tenant, currency, branch, channel, payment method, and status.
 * Enforces strict currency consistency against `filter.currency`.
 */
export function filterSalesTransactions(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter
): SalesTransactionRecord[] {
  const fromMs = new Date(period.from).getTime();
  const toMs = new Date(period.to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) {
    throw new InvalidReportPeriodError('Invalid period boundaries.');
  }

  const targetCurrency = normalizeCurrencyCode(filter.currency);
  const branchSet = filter.branchIds ? new Set(filter.branchIds) : null;
  const channelSet = filter.channels ? new Set(filter.channels) : null;
  const paymentSet = filter.paymentMethods ? new Set(filter.paymentMethods) : null;

  const result: SalesTransactionRecord[] = [];

  for (const tx of records) {
    const txCurrency = normalizeCurrencyCode(tx.currency);
    if (txCurrency !== targetCurrency) {
      throw new ReportCurrencyMismatchError(targetCurrency, txCurrency);
    }

    if (filter.tenantId && tx.tenantId !== filter.tenantId) {
      continue;
    }

    const occurredMs = new Date(tx.occurredAt).getTime();
    if (occurredMs < fromMs || occurredMs > toMs) {
      continue;
    }

    if (tx.status === 'VOIDED' && !filter.includeVoided) {
      continue;
    }
    if (tx.status === 'REFUNDED' && !filter.includeRefunded) {
      continue;
    }

    if (branchSet && (!tx.branchId || !branchSet.has(tx.branchId))) {
      continue;
    }
    if (channelSet && !channelSet.has(tx.channel)) {
      continue;
    }
    if (paymentSet) {
      const hasMatchingPayment = tx.payments.some((p) => paymentSet.has(p.method));
      if (!hasMatchingPayment) {
        continue;
      }
    }

    result.push(tx);
  }

  return result;
}

/**
 * Computes a complete sales summary in integer cents with ROUND_HALF_EVEN.
 */
export function calculateSalesSummary(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter
): SalesSummaryReport {
  const filtered = filterSalesTransactions(records, period, filter);
  const currency = normalizeCurrencyCode(filter.currency);

  let grossSalesCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let netSalesCents = 0;
  let refundCents = 0;
  let costOfGoodsCents = 0;
  let transactionCount = 0;
  let refundCount = 0;
  let voidedCount = 0;

  const paymentAcc = new Map<string, { amountCents: number; transactionCount: number }>();
  const channelAcc = new Map<
    string,
    { netSalesCents: number; grossProfitCents: number; transactionCount: number }
  >();
  const branchAcc = new Map<
    string,
    { netSalesCents: number; grossProfitCents: number; transactionCount: number }
  >();

  for (const tx of filtered) {
    if (tx.status === 'VOIDED') {
      voidedCount += 1;
      continue;
    }

    if (tx.status === 'REFUNDED') {
      refundCount += 1;
      refundCents += Math.abs(tx.netCents);
      netSalesCents -= Math.abs(tx.netCents);
      costOfGoodsCents -= Math.abs(tx.costCents);
      continue;
    }

    transactionCount += 1;
    grossSalesCents += tx.grossCents;
    discountCents += tx.discountCents;
    taxCents += tx.taxCents;
    netSalesCents += tx.netCents;
    costOfGoodsCents += tx.costCents;

    const txProfit = tx.netCents - tx.costCents;

    for (const p of tx.payments) {
      const prev = paymentAcc.get(p.method) ?? { amountCents: 0, transactionCount: 0 };
      prev.amountCents += p.amountCents;
      prev.transactionCount += 1;
      paymentAcc.set(p.method, prev);
    }

    const chPrev = channelAcc.get(tx.channel) ?? {
      netSalesCents: 0,
      grossProfitCents: 0,
      transactionCount: 0,
    };
    chPrev.netSalesCents += tx.netCents;
    chPrev.grossProfitCents += txProfit;
    chPrev.transactionCount += 1;
    channelAcc.set(tx.channel, chPrev);

    const branchKey = tx.branchId ?? 'UNASSIGNED';
    const brPrev = branchAcc.get(branchKey) ?? {
      netSalesCents: 0,
      grossProfitCents: 0,
      transactionCount: 0,
    };
    brPrev.netSalesCents += tx.netCents;
    brPrev.grossProfitCents += txProfit;
    brPrev.transactionCount += 1;
    branchAcc.set(branchKey, brPrev);
  }

  const grossProfitCents = netSalesCents - costOfGoodsCents;
  const grossMarginBps =
    netSalesCents > 0 ? calculateBpsHalfEven(grossProfitCents, netSalesCents) : 0;
  const averageTicketCents =
    transactionCount > 0
      ? Number(divideHalfEven(BigInt(netSalesCents), BigInt(transactionCount)))
      : 0;

  const totalPaymentsCents = Array.from(paymentAcc.values()).reduce(
    (sum, item) => sum + item.amountCents,
    0
  );

  const paymentMethods: PaymentMethodSummary[] = Array.from(paymentAcc.entries())
    .map(([method, data]) => ({
      method,
      amountCents: data.amountCents,
      transactionCount: data.transactionCount,
      shareBps:
        totalPaymentsCents > 0
          ? calculateBpsHalfEven(data.amountCents, totalPaymentsCents)
          : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const positiveNetBase = netSalesCents > 0 ? netSalesCents : 0;

  const channels: DimensionBreakdownItem[] = Array.from(channelAcc.entries())
    .map(([key, data]) => ({
      key,
      netSalesCents: data.netSalesCents,
      grossProfitCents: data.grossProfitCents,
      transactionCount: data.transactionCount,
      shareBps:
        positiveNetBase > 0 ? calculateBpsHalfEven(data.netSalesCents, positiveNetBase) : 0,
    }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents);

  const branches: DimensionBreakdownItem[] = Array.from(branchAcc.entries())
    .map(([key, data]) => ({
      key,
      netSalesCents: data.netSalesCents,
      grossProfitCents: data.grossProfitCents,
      transactionCount: data.transactionCount,
      shareBps:
        positiveNetBase > 0 ? calculateBpsHalfEven(data.netSalesCents, positiveNetBase) : 0,
    }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents);

  return {
    currency,
    period,
    grossSalesCents,
    discountCents,
    taxCents,
    netSalesCents,
    refundCents,
    costOfGoodsCents,
    grossProfitCents,
    grossMarginBps,
    transactionCount,
    refundCount,
    voidedCount,
    averageTicketCents,
    paymentMethods,
    channels,
    branches,
  };
}

function getBucketInfo(
  isoDate: string,
  granularity: ReportGranularity,
  timezoneOffsetMinutes: number
): { key: string; startIso: string } {
  const utcMs = new Date(isoDate).getTime();
  const shifted = new Date(utcMs + timezoneOffsetMinutes * 60_000);

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();

  const pad = (n: number) => String(n).padStart(2, '0');

  if (granularity === 'HOUR') {
    const key = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:00`;
    const startMs = Date.UTC(year, month, day, hour, 0, 0) - timezoneOffsetMinutes * 60_000;
    return { key, startIso: new Date(startMs).toISOString() };
  }

  if (granularity === 'DAY') {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const startMs = Date.UTC(year, month, day, 0, 0, 0) - timezoneOffsetMinutes * 60_000;
    return { key, startIso: new Date(startMs).toISOString() };
  }

  if (granularity === 'WEEK') {
    // ISO week Monday start
    const dayOfWeek = shifted.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(Date.UTC(year, month, day + diffToMonday, 0, 0, 0));
    const key = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(
      monday.getUTCDate()
    )}`;
    const startMs = monday.getTime() - timezoneOffsetMinutes * 60_000;
    return { key, startIso: new Date(startMs).toISOString() };
  }

  // MONTH
  const key = `${year}-${pad(month + 1)}`;
  const startMs = Date.UTC(year, month, 1, 0, 0, 0) - timezoneOffsetMinutes * 60_000;
  return { key, startIso: new Date(startMs).toISOString() };
}

/**
 * Aggregates sales transactions into chronological time-series buckets.
 */
export function buildTimeSeriesReport(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter
): TimeSeriesReport {
  const filtered = filterSalesTransactions(records, period, filter);
  const currency = normalizeCurrencyCode(filter.currency);

  const bucketMap = new Map<
    string,
    {
      bucketStartIso: string;
      netSalesCents: number;
      grossProfitCents: number;
      taxCents: number;
      discountCents: number;
      transactionCount: number;
    }
  >();

  for (const tx of filtered) {
    if (tx.status === 'VOIDED') continue;

    const { key, startIso } = getBucketInfo(
      tx.occurredAt,
      period.granularity,
      period.timezoneOffsetMinutes
    );

    const existing = bucketMap.get(key) ?? {
      bucketStartIso: startIso,
      netSalesCents: 0,
      grossProfitCents: 0,
      taxCents: 0,
      discountCents: 0,
      transactionCount: 0,
    };

    if (tx.status === 'REFUNDED') {
      const absNet = Math.abs(tx.netCents);
      const absCost = Math.abs(tx.costCents);
      existing.netSalesCents -= absNet;
      existing.grossProfitCents -= absNet - absCost;
    } else {
      existing.netSalesCents += tx.netCents;
      existing.grossProfitCents += tx.netCents - tx.costCents;
      existing.taxCents += tx.taxCents;
      existing.discountCents += tx.discountCents;
      existing.transactionCount += 1;
    }

    bucketMap.set(key, existing);
  }

  const buckets: TimeSeriesBucket[] = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketKey, data]) => ({
      bucketKey,
      bucketStartIso: data.bucketStartIso,
      netSalesCents: data.netSalesCents,
      grossProfitCents: data.grossProfitCents,
      taxCents: data.taxCents,
      discountCents: data.discountCents,
      transactionCount: data.transactionCount,
      averageTicketCents:
        data.transactionCount > 0
          ? Number(divideHalfEven(BigInt(data.netSalesCents), BigInt(data.transactionCount)))
          : 0,
    }));

  return {
    currency,
    granularity: period.granularity,
    period,
    buckets,
  };
}

/**
 * Ranks top-selling items by net revenue (descending) with exact profit & margin bps.
 */
export function calculateTopItems(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter,
  sortBy: 'REVENUE' | 'PROFIT' | 'QUANTITY' = 'REVENUE'
): TopItemMetric[] {
  const filtered = filterSalesTransactions(records, period, filter);
  const categorySet = filter.categoryIds ? new Set(filter.categoryIds) : null;

  const acc = new Map<
    string,
    {
      itemId: string;
      sku?: string;
      name: string;
      categoryId?: string;
      quantitySold: number;
      netSalesCents: number;
      costCents: number;
    }
  >();

  let totalNetSalesCents = 0;

  for (const tx of filtered) {
    if (tx.status !== 'COMPLETED') continue;

    for (const line of tx.lines) {
      if (categorySet && (!line.categoryId || !categorySet.has(line.categoryId))) {
        continue;
      }

      const lineCost = Math.round(line.unitCostCents * line.quantity);
      const prev = acc.get(line.itemId) ?? {
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        categoryId: line.categoryId,
        quantitySold: 0,
        netSalesCents: 0,
        costCents: 0,
      };

      prev.quantitySold += line.quantity;
      prev.netSalesCents += line.netTotalCents;
      prev.costCents += lineCost;
      acc.set(line.itemId, prev);

      totalNetSalesCents += line.netTotalCents;
    }
  }

  const items: TopItemMetric[] = Array.from(acc.values()).map((entry) => {
    const grossProfitCents = entry.netSalesCents - entry.costCents;
    return {
      itemId: entry.itemId,
      sku: entry.sku,
      name: entry.name,
      categoryId: entry.categoryId,
      quantitySold: entry.quantitySold,
      netSalesCents: entry.netSalesCents,
      costCents: entry.costCents,
      grossProfitCents,
      grossMarginBps:
        entry.netSalesCents > 0
          ? calculateBpsHalfEven(grossProfitCents, entry.netSalesCents)
          : 0,
      shareBps:
        totalNetSalesCents > 0
          ? calculateBpsHalfEven(entry.netSalesCents, totalNetSalesCents)
          : 0,
    };
  });

  items.sort((a, b) => {
    if (sortBy === 'PROFIT') return b.grossProfitCents - a.grossProfitCents;
    if (sortBy === 'QUANTITY') return b.quantitySold - a.quantitySold;
    return b.netSalesCents - a.netSalesCents;
  });

  return items.slice(0, filter.topLimit);
}

/**
 * Aggregates sales and profitability grouped by category.
 */
export function calculateCategoryBreakdown(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter
): CategoryBreakdownMetric[] {
  const filtered = filterSalesTransactions(records, period, filter);
  const categorySet = filter.categoryIds ? new Set(filter.categoryIds) : null;

  const acc = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      quantitySold: number;
      netSalesCents: number;
      costCents: number;
    }
  >();

  let totalNetSalesCents = 0;

  for (const tx of filtered) {
    if (tx.status !== 'COMPLETED') continue;

    for (const line of tx.lines) {
      const catId = line.categoryId ?? 'UNCATEGORIZED';
      if (categorySet && !categorySet.has(catId)) {
        continue;
      }

      const catName = line.categoryName ?? catId;
      const lineCost = Math.round(line.unitCostCents * line.quantity);

      const prev = acc.get(catId) ?? {
        categoryId: catId,
        categoryName: catName,
        quantitySold: 0,
        netSalesCents: 0,
        costCents: 0,
      };

      prev.quantitySold += line.quantity;
      prev.netSalesCents += line.netTotalCents;
      prev.costCents += lineCost;
      acc.set(catId, prev);

      totalNetSalesCents += line.netTotalCents;
    }
  }

  return Array.from(acc.values())
    .map((entry) => {
      const grossProfitCents = entry.netSalesCents - entry.costCents;
      return {
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        quantitySold: entry.quantitySold,
        netSalesCents: entry.netSalesCents,
        costCents: entry.costCents,
        grossProfitCents,
        grossMarginBps:
          entry.netSalesCents > 0
            ? calculateBpsHalfEven(grossProfitCents, entry.netSalesCents)
            : 0,
        shareBps:
          totalNetSalesCents > 0
            ? calculateBpsHalfEven(entry.netSalesCents, totalNetSalesCents)
            : 0,
      };
    })
    .sort((a, b) => b.netSalesCents - a.netSalesCents);
}

function buildMetricDelta(current: number, previous: number): MetricDelta {
  const delta = current - previous;
  const deltaBps =
    previous !== 0
      ? calculateBpsHalfEven(delta, Math.abs(previous))
      : current > 0
        ? 10000
        : current < 0
          ? -10000
          : 0;
  const trend: ComparisonTrend = delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT';

  return {
    current,
    previous,
    delta,
    deltaBps,
    trend,
  };
}

/**
 * Compares two sales periods and computes absolute deltas and basis-point growth.
 */
export function compareSalesPeriods(
  currentRecords: ReadonlyArray<SalesTransactionRecord>,
  previousRecords: ReadonlyArray<SalesTransactionRecord>,
  currentPeriod: ReportPeriod,
  previousPeriod: ReportPeriod,
  filter: ReportFilter
): PeriodComparisonReport {
  const currentSummary = calculateSalesSummary(currentRecords, currentPeriod, filter);
  const previousSummary = calculateSalesSummary(previousRecords, previousPeriod, filter);

  return {
    currency: currentSummary.currency,
    currentPeriod,
    previousPeriod,
    netSales: buildMetricDelta(currentSummary.netSalesCents, previousSummary.netSalesCents),
    grossProfit: buildMetricDelta(
      currentSummary.grossProfitCents,
      previousSummary.grossProfitCents
    ),
    transactionCount: buildMetricDelta(
      currentSummary.transactionCount,
      previousSummary.transactionCount
    ),
    averageTicket: buildMetricDelta(
      currentSummary.averageTicketCents,
      previousSummary.averageTicketCents
    ),
  };
}

/**
 * Computes customer retention, repeat rate (bps), and average LTV within the period.
 */
export function calculateCustomerAnalytics(
  records: ReadonlyArray<SalesTransactionRecord>,
  period: ReportPeriod,
  filter: ReportFilter
): CustomerAnalyticsReport {
  const filtered = filterSalesTransactions(records, period, filter);
  const currency = normalizeCurrencyCode(filter.currency);

  const customerMap = new Map<string, { orderCount: number; netSalesCents: number }>();
  let identifiedSalesCents = 0;
  let anonymousSalesCents = 0;

  for (const tx of filtered) {
    if (tx.status !== 'COMPLETED') continue;

    if (!tx.customerId) {
      anonymousSalesCents += tx.netCents;
      continue;
    }

    identifiedSalesCents += tx.netCents;
    const prev = customerMap.get(tx.customerId) ?? { orderCount: 0, netSalesCents: 0 };
    prev.orderCount += 1;
    prev.netSalesCents += tx.netCents;
    customerMap.set(tx.customerId, prev);
  }

  const uniqueCustomers = customerMap.size;
  let repeatCustomers = 0;
  for (const data of customerMap.values()) {
    if (data.orderCount > 1) {
      repeatCustomers += 1;
    }
  }

  const repeatRateBps =
    uniqueCustomers > 0 ? calculateBpsHalfEven(repeatCustomers, uniqueCustomers) : 0;
  const averageLtvInPeriodCents =
    uniqueCustomers > 0
      ? Number(divideHalfEven(BigInt(identifiedSalesCents), BigInt(uniqueCustomers)))
      : 0;

  const topCustomers = Array.from(customerMap.entries())
    .map(([customerId, data]) => ({
      customerId,
      orderCount: data.orderCount,
      netSalesCents: data.netSalesCents,
      averageTicketCents: Number(
        divideHalfEven(BigInt(data.netSalesCents), BigInt(data.orderCount))
      ),
    }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents)
    .slice(0, filter.topLimit);

  return {
    currency,
    period,
    uniqueCustomers,
    repeatCustomers,
    repeatRateBps,
    identifiedSalesCents,
    anonymousSalesCents,
    averageLtvInPeriodCents,
    topCustomers,
  };
}
