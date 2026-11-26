import { generateId } from '@modulos/core-shared';
import { IReportClock, SystemReportClock } from '../contracts/report-contracts.js';
import {
  InvalidReportInputError,
  ReportDefinitionNotFoundError,
} from '../domain/errors/report-errors.js';
import {
  assertReportFeatureEnabled,
  type ReportFeatureProfileInput,
  resolveReportFeatureFlags,
} from '../domain/services/report-features.js';
import {
  IReportDefinitionRepository,
  ReportDefinitionFilter,
} from '../repositories/report-definition-repository.interface.js';
import {
  REPORTS_SCHEMA_VERSION,
  ReportDefinition,
  ReportDefinitionSchema,
  ReportFilter,
  ReportGranularity,
  ReportType,
} from '../schemas/report-schemas.js';

export interface SaveReportDefinitionInput {
  id?: string;
  tenantId?: string;
  name: string;
  description?: string;
  type: ReportType;
  filter: ReportFilter;
  defaultGranularity?: ReportGranularity;
  createdBy?: string;
  profile?: ReportFeatureProfileInput;
  features?: ReportFeatureProfileInput;
}

export class ManageReportDefinitionsUseCase {
  constructor(
    private readonly repository: IReportDefinitionRepository,
    private readonly clock: IReportClock = SystemReportClock
  ) {}

  async save(input: SaveReportDefinitionInput): Promise<ReportDefinition> {
    const flags = resolveReportFeatureFlags(input.features ?? input.profile, 'INTERMEDIATE');
    assertReportFeatureEnabled(flags, 'savedDefinitions');

    const nowIso = this.clock.now().toISOString();
    const existing = input.id ? await this.repository.findById(input.id) : null;

    const candidate = {
      schemaVersion: REPORTS_SCHEMA_VERSION,
      id: input.id ?? generateId(),
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      type: input.type,
      filter: input.filter,
      defaultGranularity: input.defaultGranularity ?? 'DAY',
      createdBy: existing?.createdBy ?? input.createdBy,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    const parsed = ReportDefinitionSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new InvalidReportInputError(
        'Invalid report definition.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      );
    }

    await this.repository.save(parsed.data);
    return parsed.data;
  }

  async getById(id: string): Promise<ReportDefinition> {
    const found = await this.repository.findById(id);
    if (!found) {
      throw new ReportDefinitionNotFoundError(id);
    }
    return found;
  }

  async list(filter?: ReportDefinitionFilter): Promise<ReportDefinition[]> {
    return this.repository.list(filter);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new ReportDefinitionNotFoundError(id);
    }
  }
}
