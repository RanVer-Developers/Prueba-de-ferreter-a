// Schemas & Types
export {
  REPORTS_SCHEMA_VERSION,
  ReportSchemaVersionSchema,
  SafeCentsSchema,
  NonNegativeCentsSchema,
  NonNegativeQuantitySchema,
  ReportGranularitySchema,
  ReportTypeSchema,
  ExportFormatSchema,
  TransactionRecordStatusSchema,
  ReportPeriodSchema,
  ReportFilterSchema,
  PaymentSplitRecordSchema,
  SalesLineRecordSchema,
  SalesTransactionRecordSchema,
  InventorySnapshotRecordSchema,
  ReportDefinitionSchema,
  type ReportGranularity,
  type ReportType,
  type ExportFormat,
  type TransactionRecordStatus,
  type ReportPeriod,
  type ReportFilter,
  type PaymentSplitRecord,
  type SalesLineRecord,
  type SalesTransactionRecord,
  type InventorySnapshotRecord,
  type ReportDefinition,
} from './schemas/report-schemas.js';

// Domain Errors
export {
  ReportDomainError,
  InvalidReportInputError,
  ReportFeatureDisabledError,
  InvalidReportPeriodError,
  ReportCurrencyMismatchError,
  ReportDefinitionNotFoundError,
  UnsupportedExportFormatError,
} from './domain/errors/report-errors.js';

// Feature Flags & Presets
export {
  REPORT_TIER_PRESETS,
  resolveReportFeatures,
  resolveReportFeatureFlags,
  assertReportFeatureEnabled,
  type ReportTier,
  type ReportFeatureFlags,
  type ReportFeature,
  type ReportFeatureProfile,
  type ReportFeatureProfileInput,
} from './domain/services/report-features.js';

// Pure Domain Analytics Services
export {
  calculateBpsHalfEven,
  filterSalesTransactions,
  calculateSalesSummary,
  buildTimeSeriesReport,
  calculateTopItems,
  calculateCategoryBreakdown,
  compareSalesPeriods,
  calculateCustomerAnalytics,
  type PaymentMethodSummary,
  type DimensionBreakdownItem,
  type SalesSummaryReport,
  type TimeSeriesBucket,
  type TimeSeriesReport,
  type TopItemMetric,
  type CategoryBreakdownMetric,
  type ComparisonTrend,
  type MetricDelta,
  type PeriodComparisonReport,
  type CustomerAnalyticsReport,
} from './domain/services/sales-analytics.service.js';

export {
  buildInventorySnapshotsFromSales,
  calculateAbcParetoReport,
  type AbcClass,
  type AbcMetric,
  type AbcParetoItem,
  type AbcParetoReport,
  type InventoryStockBaseInput,
} from './domain/services/inventory-analytics.service.js';

export {
  calculateLineItemMarginReport,
  type LineItemMarginMetric,
  type LineItemMarginReport,
} from './domain/services/line-item-analytics.service.js';

export {
  escapeCsvCell,
  formatTabularExport,
  type TabularCell,
  type TabularDataset,
  type ExportedReportPayload,
} from './domain/services/report-formatter.service.js';

// Contracts & Ports
export {
  SystemReportClock,
  type IReportDataSource,
  type IReportExporter,
  type IReportClock,
} from './contracts/report-contracts.js';

// Repositories
export type {
  IReportDefinitionRepository,
  ReportDefinitionFilter,
} from './repositories/report-definition-repository.interface.js';
export { InMemoryReportDefinitionRepository } from './repositories/in-memory/in-memory-report-definition-repository.js';

// Use Cases
export {
  GenerateSalesReportUseCase,
  type GenerateSalesSummaryInput,
  type GenerateTopItemsInput,
  type ComparePeriodsInput,
} from './use-cases/generate-sales-report.use-case.js';
export {
  GenerateAbcReportUseCase,
  type GenerateAbcReportInput,
} from './use-cases/generate-abc-report.use-case.js';
export {
  ExportReportUseCase,
  type ExportReportInput,
} from './use-cases/export-report.use-case.js';
export {
  ManageReportDefinitionsUseCase,
  type SaveReportDefinitionInput,
} from './use-cases/manage-report-definitions.use-case.js';
export * from './reports-module.js';
