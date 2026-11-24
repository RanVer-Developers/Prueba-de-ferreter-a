import { ReportDefinition, ReportType } from '../schemas/report-schemas.js';

export interface ReportDefinitionFilter {
  tenantId?: string;
  type?: ReportType;
}

export interface IReportDefinitionRepository {
  findById(id: string): Promise<ReportDefinition | null>;
  list(filter?: ReportDefinitionFilter): Promise<ReportDefinition[]>;
  save(definition: ReportDefinition): Promise<void>;
  delete(id: string): Promise<boolean>;
}
