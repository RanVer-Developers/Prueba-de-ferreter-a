import {
  IReportClock,
  IReportExporter,
  SystemReportClock,
} from '../contracts/report-contracts.js';
import { InvalidReportInputError } from '../domain/errors/report-errors.js';
import {
  assertReportFeatureEnabled,
  type ReportFeatureProfileInput,
  resolveReportFeatureFlags,
} from '../domain/services/report-features.js';
import {
  ExportedReportPayload,
  formatTabularExport,
  TabularDataset,
} from '../domain/services/report-formatter.service.js';
import { ExportFormat, ExportFormatSchema } from '../schemas/report-schemas.js';

export interface ExportReportInput {
  dataset: TabularDataset;
  format: ExportFormat;
  filename: string;
  profile?: ReportFeatureProfileInput;
  features?: ReportFeatureProfileInput;
}

export class ExportReportUseCase {
  constructor(
    private readonly exporter?: IReportExporter,
    private readonly clock: IReportClock = SystemReportClock
  ) {}

  async execute(input: ExportReportInput): Promise<ExportedReportPayload> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'INTERMEDIATE');
    assertReportFeatureEnabled(flags, 'dataExport');

    const parsedFormat = ExportFormatSchema.safeParse(input.format);
    if (!parsedFormat.success) {
      throw new InvalidReportInputError(
        `Invalid export format '${String(input.format)}'.`
      );
    }

    if (!input.dataset || !Array.isArray(input.dataset.columns) || input.dataset.columns.length === 0) {
      throw new InvalidReportInputError('Export dataset must include at least one column.');
    }

    const payload = formatTabularExport(
      input.dataset,
      parsedFormat.data,
      input.filename,
      this.clock.now().toISOString()
    );

    if (this.exporter) {
      await this.exporter.deliver(payload);
    }

    return payload;
  }
}
