import {
  ReportDefinition,
  ReportDefinitionSchema,
} from '../../schemas/report-schemas.js';
import {
  IReportDefinitionRepository,
  ReportDefinitionFilter,
} from '../report-definition-repository.interface.js';

export class InMemoryReportDefinitionRepository implements IReportDefinitionRepository {
  private readonly store = new Map<string, ReportDefinition>();

  async findById(id: string): Promise<ReportDefinition | null> {
    const item = this.store.get(id);
    return item ? structuredClone(item) : null;
  }

  async list(filter?: ReportDefinitionFilter): Promise<ReportDefinition[]> {
    const items = Array.from(this.store.values()).filter((def) => {
      if (filter?.tenantId && def.tenantId !== filter.tenantId) return false;
      if (filter?.type && def.type !== filter.type) return false;
      return true;
    });
    return items.map((item) => structuredClone(item));
  }

  async save(definition: ReportDefinition): Promise<void> {
    const parsed = ReportDefinitionSchema.parse(definition);
    this.store.set(parsed.id, structuredClone(parsed));
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
