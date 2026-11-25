import type {
  Branch,
  BranchStatus,
  CompanyProfile,
  CompanyStatus,
  FiscalPeriod,
  FiscalPeriodStatus,
  SettingEntry,
  SettingScopeType,
} from '../schemas/settings.schemas.js';

export interface CompanyFilter {
  status?: CompanyStatus;
  search?: string;
}

export interface ICompanyRepository {
  save(company: CompanyProfile, expectedVersion?: number): Promise<void>;
  findById(id: string): Promise<CompanyProfile | null>;
  findByCode(code: string): Promise<CompanyProfile | null>;
  findAll(filter?: CompanyFilter): Promise<CompanyProfile[]>;
}

export interface BranchFilter {
  companyId?: string;
  status?: BranchStatus;
  search?: string;
}

export interface IBranchRepository {
  save(branch: Branch, expectedVersion?: number): Promise<void>;
  findById(id: string): Promise<Branch | null>;
  findByCode(companyId: string, code: string): Promise<Branch | null>;
  findAll(filter?: BranchFilter): Promise<Branch[]>;
}

export interface FiscalPeriodFilter {
  companyId: string;
  fiscalYear?: number;
  status?: FiscalPeriodStatus;
}

export interface IFiscalPeriodRepository {
  save(period: FiscalPeriod, expectedVersion?: number): Promise<void>;
  findById(id: string): Promise<FiscalPeriod | null>;
  findByCompany(filter: FiscalPeriodFilter): Promise<FiscalPeriod[]>;
}

export interface SettingFilter {
  scopeType?: SettingScopeType;
  scopeId?: string;
  keyPrefix?: string;
}

export interface ISettingRepository {
  save(entry: SettingEntry): Promise<void>;
  findOne(scopeType: SettingScopeType, scopeId: string | undefined, key: string): Promise<SettingEntry | null>;
  findAll(filter?: SettingFilter): Promise<SettingEntry[]>;
  delete(scopeType: SettingScopeType, scopeId: string | undefined, key: string): Promise<void>;
}
