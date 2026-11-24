import { IReportDataSource } from '../contracts/report-contracts.js';
import { InvalidReportInputError } from '../domain/errors/report-errors.js';
import {
  assertReportFeatureEnabled,
  type ReportFeatureProfileInput,
  resolveReportFeatureFlags,
} from '../domain/services/report-features.js';
import {
  buildTimeSeriesReport,
  calculateCategoryBreakdown,
  calculateCustomerAnalytics,
  calculateSalesSummary,
  calculateTopItems,
  CategoryBreakdownMetric,
  compareSalesPeriods,
  CustomerAnalyticsReport,
  PeriodComparisonReport,
  SalesSummaryReport,
  TimeSeriesReport,
  TopItemMetric,
} from '../domain/services/sales-analytics.service.js';
import {
  ReportFilter,
  ReportFilterSchema,
  ReportPeriod,
  ReportPeriodSchema,
  SalesTransactionRecordSchema,
} from '../schemas/report-schemas.js';

export interface GenerateSalesSummaryInput {
  period: ReportPeriod;
  filter: ReportFilter;
  profile?: ReportFeatureProfileInput;
  features?: ReportFeatureProfileInput;
}

export interface GenerateTopItemsInput extends GenerateSalesSummaryInput {
  sortBy?: 'REVENUE' | 'PROFIT' | 'QUANTITY';
}

export interface ComparePeriodsInput {
  currentPeriod: ReportPeriod;
  previousPeriod: ReportPeriod;
  filter: ReportFilter;
  profile?: ReportFeatureProfileInput;
  features?: ReportFeatureProfileInput;
}

function validatePeriodAndFilter(period: unknown, filter: unknown) {
  const parsedPeriod = ReportPeriodSchema.safeParse(period);
  if (!parsedPeriod.success) {
    throw new InvalidReportInputError(
      'Invalid report period.',
      parsedPeriod.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  const parsedFilter = ReportFilterSchema.safeParse(filter);
  if (!parsedFilter.success) {
    throw new InvalidReportInputError(
      'Invalid report filter.',
      parsedFilter.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }

  return { period: parsedPeriod.data, filter: parsedFilter.data };
}

function validateRecords(rawRecords: unknown[]) {
  return rawRecords.map((rec, idx) => {
    const parsed = SalesTransactionRecordSchema.safeParse(rec);
    if (!parsed.success) {
      throw new InvalidReportInputError(
        `Invalid sales transaction record at index ${idx}.`,
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      );
    }
    return parsed.data;
  });
}

export class GenerateSalesReportUseCase {
  constructor(private readonly dataSource: IReportDataSource) {}

  async generateSummary(input: GenerateSalesSummaryInput): Promise<SalesSummaryReport> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'BASIC');
    assertReportFeatureEnabled(flags, 'salesSummary');

    const { period, filter } = validatePeriodAndFilter(input.period, input.filter);
    const raw = await this.dataSource.fetchSalesTransactions(period, filter);
    const records = validateRecords(raw);

    const summary = calculateSalesSummary(records, period, filter);

    // If profitabilityMetrics is disabled (e.g. BASIC tier), zero out cost/profit fields
    if (!flags.profitabilityMetrics) {
      return {
        ...summary,
        costOfGoodsCents: 0,
        grossProfitCents: 0,
        grossMarginBps: 0,
        channels: flags.dimensionalBreakdown ? summary.channels : [],
        branches: flags.dimensionalBreakdown ? summary.branches : [],
      };
    }

    if (!flags.dimensionalBreakdown) {
      return {
        ...summary,
        channels: [],
        branches: [],
      };
    }

    return summary;
  }

  async generateTimeSeries(input: GenerateSalesSummaryInput): Promise<TimeSeriesReport> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'INTERMEDIATE');
    assertReportFeatureEnabled(flags, 'timeSeries');

    const { period, filter } = validatePeriodAndFilter(input.period, input.filter);
    const raw = await this.dataSource.fetchSalesTransactions(period, filter);
    const records = validateRecords(raw);

    return buildTimeSeriesReport(records, period, filter);
  }

  async generateTopItems(input: GenerateTopItemsInput): Promise<TopItemMetric[]> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'BASIC');
    assertReportFeatureEnabled(flags, 'salesSummary');

    const { period, filter } = validatePeriodAndFilter(input.period, input.filter);
    const raw = await this.dataSource.fetchSalesTransactions(period, filter);
    const records = validateRecords(raw);

    return calculateTopItems(records, period, filter, input.sortBy ?? 'REVENUE');
  }

  async generateCategoryBreakdown(
    input: GenerateSalesSummaryInput
  ): Promise<CategoryBreakdownMetric[]> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'INTERMEDIATE');
    assertReportFeatureEnabled(flags, 'dimensionalBreakdown');

    const { period, filter } = validatePeriodAndFilter(input.period, input.filter);
    const raw = await this.dataSource.fetchSalesTransactions(period, filter);
    const records = validateRecords(raw);

    return calculateCategoryBreakdown(records, period, filter);
  }

  async comparePeriods(input: ComparePeriodsInput): Promise<PeriodComparisonReport> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'INTERMEDIATE');
    assertReportFeatureEnabled(flags, 'periodComparison');

    const { period: currentPeriod, filter } = validatePeriodAndFilter(
      input.currentPeriod,
      input.filter
    );
    const parsedPrev = ReportPeriodSchema.safeParse(input.previousPeriod);
    if (!parsedPrev.success) {
      throw new InvalidReportInputError(
        'Invalid previous report period.',
        parsedPrev.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      );
    }

    const [rawCurrent, rawPrevious] = await Promise.all([
      this.dataSource.fetchSalesTransactions(currentPeriod, filter),
      this.dataSource.fetchSalesTransactions(parsedPrev.data, filter),
    ]);

    return compareSalesPeriods(
      validateRecords(rawCurrent),
      validateRecords(rawPrevious),
      currentPeriod,
      parsedPrev.data,
      filter
    );
  }

  async generateCustomerAnalytics(
    input: GenerateSalesSummaryInput
  ): Promise<CustomerAnalyticsReport> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'ADVANCED');
    assertReportFeatureEnabled(flags, 'customerAnalytics');

    const { period, filter } = validatePeriodAndFilter(input.period, input.filter);
    const raw = await this.dataSource.fetchSalesTransactions(period, filter);
    const records = validateRecords(raw);

    return calculateCustomerAnalytics(records, period, filter);
  }
}
