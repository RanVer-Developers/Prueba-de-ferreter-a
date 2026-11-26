import type {
  BranchStatus,
  CompanyStatus,
  FiscalPeriodStatus,
  SettingScopeType,
  SettingValue,
} from '../../schemas/settings.schemas.js';

export type SettingsDomainEvent =
  | {
      type: 'CompanyCreated';
      companyId: string;
      code: string;
      occurredAt: string;
    }
  | {
      type: 'CompanyUpdated';
      companyId: string;
      status: CompanyStatus;
      occurredAt: string;
    }
  | {
      type: 'BranchCreated';
      branchId: string;
      companyId: string;
      code: string;
      occurredAt: string;
    }
  | {
      type: 'BranchUpdated';
      branchId: string;
      companyId: string;
      status: BranchStatus;
      occurredAt: string;
    }
  | {
      type: 'FiscalPeriodCreated';
      periodId: string;
      companyId: string;
      fiscalYear: number;
      periodNumber: number;
      occurredAt: string;
    }
  | {
      type: 'FiscalPeriodStatusChanged';
      periodId: string;
      companyId: string;
      previousStatus: FiscalPeriodStatus;
      newStatus: FiscalPeriodStatus;
      changedBy?: string;
      occurredAt: string;
    }
  | {
      type: 'SettingChanged';
      key: string;
      scopeType: SettingScopeType;
      scopeId?: string;
      previousValue?: SettingValue;
      newValue: SettingValue;
      updatedBy?: string;
      occurredAt: string;
    };
