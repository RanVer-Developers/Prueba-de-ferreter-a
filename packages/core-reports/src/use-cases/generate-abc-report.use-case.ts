import { IReportDataSource } from '../contracts/report-contracts.js';
import { InvalidReportInputError } from '../domain/errors/report-errors.js';
import {
  AbcMetric,
  AbcParetoReport,
  calculateAbcParetoReport,
} from '../domain/services/inventory-analytics.service.js';
import {
  assertReportFeatureEnabled,
  type ReportFeatureProfileInput,
  resolveReportFeatureFlags,
} from '../domain/services/report-features.js';
import {
  InventorySnapshotRecordSchema,
  ReportFilter,
  ReportFilterSchema,
} from '../schemas/report-schemas.js';

export interface GenerateAbcReportInput {
  filter: ReportFilter;
  metric?: AbcMetric;
  profile?: ReportFeatureProfileInput;
  features?: ReportFeatureProfileInput;
}

export class GenerateAbcReportUseCase {
  constructor(private readonly dataSource: IReportDataSource) {}

  async execute(input: GenerateAbcReportInput): Promise<AbcParetoReport> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'ADVANCED');
    assertReportFeatureEnabled(flags, 'abcParetoAnalytics');

    const parsedFilter = ReportFilterSchema.safeParse(input.filter);
    if (!parsedFilter.success) {
      throw new InvalidReportInputError(
        'Invalid report filter.',
        parsedFilter.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      );
    }

    if (!this.dataSource.fetchInventorySnapshots) {
      throw new InvalidReportInputError(
        'Report data source does not implement fetchInventorySnapshots().'
      );
    }

    const rawSnapshots = await this.dataSource.fetchInventorySnapshots(parsedFilter.data);
    const snapshots = rawSnapshots.map((item, idx) => {
      const parsed = InventorySnapshotRecordSchema.safeParse(item);
      if (!parsed.success) {
        throw new InvalidReportInputError(
          `Invalid inventory snapshot at index ${idx}.`,
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        );
      }
      return parsed.data;
    });

    return calculateAbcParetoReport(
      snapshots,
      parsedFilter.data.currency,
      input.metric ?? 'REVENUE'
    );
  }
}
