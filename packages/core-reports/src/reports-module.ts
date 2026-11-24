import {
  IReportClock,
  IReportDataSource,
  IReportExporter,
  SystemReportClock,
} from './contracts/report-contracts.js';
import { InvalidReportInputError } from './domain/errors/report-errors.js';
import {
  ReportFeatureFlags,
  ReportFeatureProfileInput,
  resolveReportFeatureFlags,
} from './domain/services/report-features.js';
import { InMemoryReportDefinitionRepository } from './repositories/in-memory/in-memory-report-definition-repository.js';
import {
  IReportDefinitionRepository,
  ReportDefinitionFilter,
} from './repositories/report-definition-repository.interface.js';
import { ExportReportInput, ExportReportUseCase } from './use-cases/export-report.use-case.js';
import {
  GenerateAbcReportInput,
  GenerateAbcReportUseCase,
} from './use-cases/generate-abc-report.use-case.js';
import {
  ComparePeriodsInput,
  GenerateSalesReportUseCase,
  GenerateSalesSummaryInput,
  GenerateTopItemsInput,
} from './use-cases/generate-sales-report.use-case.js';
import {
  ManageReportDefinitionsUseCase,
  SaveReportDefinitionInput,
} from './use-cases/manage-report-definitions.use-case.js';

export interface ReportsModuleDeps {
  dataSource?: IReportDataSource;
  exporter?: IReportExporter;
  definitionRepo?: IReportDefinitionRepository;
  clock?: IReportClock;
  featureProfile?: ReportFeatureProfileInput;
}

export function createReportsModule(deps: ReportsModuleDeps = {}) {
  const definitionRepo = deps.definitionRepo ?? new InMemoryReportDefinitionRepository();
  const clock = deps.clock ?? SystemReportClock;
  const features: ReportFeatureFlags = resolveReportFeatureFlags(
    deps.featureProfile,
    'INTERMEDIATE'
  );

  const exportUseCase = new ExportReportUseCase(deps.exporter, clock);
  const definitionsUseCase = new ManageReportDefinitionsUseCase(definitionRepo, clock);
  const salesUseCase = deps.dataSource ? new GenerateSalesReportUseCase(deps.dataSource) : undefined;
  const abcUseCase = deps.dataSource ? new GenerateAbcReportUseCase(deps.dataSource) : undefined;

  const requireSalesUseCase = (): GenerateSalesReportUseCase => {
    if (!salesUseCase) {
      throw new InvalidReportInputError(
        'IReportDataSource adapter is required for sales report generation in createReportsModule.'
      );
    }
    return salesUseCase;
  };

  const requireAbcUseCase = (): GenerateAbcReportUseCase => {
    if (!abcUseCase) {
      throw new InvalidReportInputError(
        'IReportDataSource adapter is required for ABC report generation in createReportsModule.'
      );
    }
    return abcUseCase;
  };

  return {
    features,
    repositories: { definitionRepo },
    useCases: {
      generateSalesReport: salesUseCase,
      generateAbcReport: abcUseCase,
      exportReport: exportUseCase,
      manageDefinitions: definitionsUseCase,
    },
    generateSalesSummary: (input: GenerateSalesSummaryInput) =>
      requireSalesUseCase().generateSummary({ features, ...input }),
    generateTimeSeries: (input: GenerateSalesSummaryInput) =>
      requireSalesUseCase().generateTimeSeries({ features, ...input }),
    generateTopItems: (input: GenerateTopItemsInput) =>
      requireSalesUseCase().generateTopItems({ features, ...input }),
    generateCategoryBreakdown: (input: GenerateSalesSummaryInput) =>
      requireSalesUseCase().generateCategoryBreakdown({ features, ...input }),
    comparePeriods: (input: ComparePeriodsInput) =>
      requireSalesUseCase().comparePeriods({ features, ...input }),
    generateCustomerAnalytics: (input: GenerateSalesSummaryInput) =>
      requireSalesUseCase().generateCustomerAnalytics({ features, ...input }),
    generateAbcReport: (input: GenerateAbcReportInput) =>
      requireAbcUseCase().execute({ features, ...input }),
    exportReport: (input: ExportReportInput) => exportUseCase.execute({ features, ...input }),
    saveDefinition: (input: SaveReportDefinitionInput) =>
      definitionsUseCase.save({ features, ...input }),
    getDefinition: (id: string) => definitionsUseCase.getById(id),
    listDefinitions: (filter?: ReportDefinitionFilter) => definitionsUseCase.list(filter),
    deleteDefinition: (id: string) => definitionsUseCase.delete(id),
  };
}

export type ReportsModule = ReturnType<typeof createReportsModule>;
