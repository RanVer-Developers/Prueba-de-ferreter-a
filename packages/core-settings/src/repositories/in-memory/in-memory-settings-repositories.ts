import { SettingsConcurrencyError } from '../../domain/errors/settings-errors.js';
import type {
  Branch,
  CompanyProfile,
  FiscalPeriod,
  SettingEntry,
  SettingScopeType,
} from '../../schemas/settings.schemas.js';
import type {
  BranchFilter,
  CompanyFilter,
  FiscalPeriodFilter,
  IBranchRepository,
  ICompanyRepository,
  IFiscalPeriodRepository,
  ISettingRepository,
  SettingFilter,
} from '../settings-repositories.interface.js';

export class InMemoryCompanyRepository implements ICompanyRepository {
  private readonly items = new Map<string, CompanyProfile>();

  async save(company: CompanyProfile, expectedVersion?: number): Promise<void> {
    if (expectedVersion !== undefined) {
      const existing = this.items.get(company.id);
      if (!existing || existing.version !== expectedVersion) {
        throw new SettingsConcurrencyError('CompanyProfile', company.id, expectedVersion);
      }
    }
    this.items.set(company.id, structuredClone(company));
  }

  async findById(id: string): Promise<CompanyProfile | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByCode(code: string): Promise<CompanyProfile | null> {
    const normalized = code.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (item.code === normalized) return structuredClone(item);
    }
    return null;
  }

  async findAll(filter?: CompanyFilter): Promise<CompanyProfile[]> {
    const search = filter?.search?.trim().toLowerCase();
    const results: CompanyProfile[] = [];
    for (const item of this.items.values()) {
      if (filter?.status && item.status !== filter.status) continue;
      if (
        search &&
        !item.legalName.toLowerCase().includes(search) &&
        !item.code.toLowerCase().includes(search) &&
        !item.taxId.toLowerCase().includes(search)
      ) {
        continue;
      }
      results.push(structuredClone(item));
    }
    return results;
  }
}

export class InMemoryBranchRepository implements IBranchRepository {
  private readonly items = new Map<string, Branch>();

  async save(branch: Branch, expectedVersion?: number): Promise<void> {
    if (expectedVersion !== undefined) {
      const existing = this.items.get(branch.id);
      if (!existing || existing.version !== expectedVersion) {
        throw new SettingsConcurrencyError('Branch', branch.id, expectedVersion);
      }
    }
    this.items.set(branch.id, structuredClone(branch));
  }

  async findById(id: string): Promise<Branch | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByCode(companyId: string, code: string): Promise<Branch | null> {
    const normalized = code.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (item.companyId === companyId && item.code === normalized) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async findAll(filter?: BranchFilter): Promise<Branch[]> {
    const search = filter?.search?.trim().toLowerCase();
    const results: Branch[] = [];
    for (const item of this.items.values()) {
      if (filter?.companyId && item.companyId !== filter.companyId) continue;
      if (filter?.status && item.status !== filter.status) continue;
      if (
        search &&
        !item.name.toLowerCase().includes(search) &&
        !item.code.toLowerCase().includes(search)
      ) {
        continue;
      }
      results.push(structuredClone(item));
    }
    return results;
  }
}

export class InMemoryFiscalPeriodRepository implements IFiscalPeriodRepository {
  private readonly items = new Map<string, FiscalPeriod>();

  async save(period: FiscalPeriod, expectedVersion?: number): Promise<void> {
    if (expectedVersion !== undefined) {
      const existing = this.items.get(period.id);
      if (!existing || existing.version !== expectedVersion) {
        throw new SettingsConcurrencyError('FiscalPeriod', period.id, expectedVersion);
      }
    }
    this.items.set(period.id, structuredClone(period));
  }

  async findById(id: string): Promise<FiscalPeriod | null> {
    const found = this.items.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByCompany(filter: FiscalPeriodFilter): Promise<FiscalPeriod[]> {
    const results: FiscalPeriod[] = [];
    for (const item of this.items.values()) {
      if (item.companyId !== filter.companyId) continue;
      if (filter.fiscalYear !== undefined && item.fiscalYear !== filter.fiscalYear) continue;
      if (filter.status && item.status !== filter.status) continue;
      results.push(structuredClone(item));
    }
    return results.sort((a, b) => a.fiscalYear - b.fiscalYear || a.periodNumber - b.periodNumber);
  }
}

export class InMemorySettingRepository implements ISettingRepository {
  private readonly items = new Map<string, SettingEntry>();

  private keyOf(scopeType: SettingScopeType, scopeId: string | undefined, key: string): string {
    return `${scopeType}::${scopeId ?? ''}::${key.toLowerCase()}`;
  }

  async save(entry: SettingEntry): Promise<void> {
    this.items.set(this.keyOf(entry.scopeType, entry.scopeId, entry.key), structuredClone(entry));
  }

  async findOne(
    scopeType: SettingScopeType,
    scopeId: string | undefined,
    key: string,
  ): Promise<SettingEntry | null> {
    const found = this.items.get(this.keyOf(scopeType, scopeId, key));
    return found ? structuredClone(found) : null;
  }

  async findAll(filter?: SettingFilter): Promise<SettingEntry[]> {
    const prefix = filter?.keyPrefix?.trim().toLowerCase();
    const results: SettingEntry[] = [];
    for (const item of this.items.values()) {
      if (filter?.scopeType && item.scopeType !== filter.scopeType) continue;
      if (filter?.scopeId && item.scopeId !== filter.scopeId) continue;
      if (prefix && !item.key.toLowerCase().startsWith(prefix)) continue;
      results.push(structuredClone(item));
    }
    return results;
  }

  async delete(scopeType: SettingScopeType, scopeId: string | undefined, key: string): Promise<void> {
    this.items.delete(this.keyOf(scopeType, scopeId, key));
  }
}
