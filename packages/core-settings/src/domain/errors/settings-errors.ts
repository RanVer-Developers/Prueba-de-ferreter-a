export class SettingsDomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidSettingsInputError extends SettingsDomainError {
  constructor(message: string) {
    super('INVALID_SETTINGS_INPUT', message);
  }
}

export class CompanyNotFoundError extends SettingsDomainError {
  constructor(companyId: string) {
    super('COMPANY_NOT_FOUND', `Company '${companyId}' was not found.`);
  }
}

export class DuplicateCompanyCodeError extends SettingsDomainError {
  constructor(code: string) {
    super('DUPLICATE_COMPANY_CODE', `Company code '${code}' already exists.`);
  }
}

export class BranchNotFoundError extends SettingsDomainError {
  constructor(branchId: string) {
    super('BRANCH_NOT_FOUND', `Branch '${branchId}' was not found.`);
  }
}

export class DuplicateBranchCodeError extends SettingsDomainError {
  constructor(companyId: string, code: string) {
    super(
      'DUPLICATE_BRANCH_CODE',
      `Branch code '${code}' already exists in company '${companyId}'.`,
    );
  }
}

export class InvalidBranchStateError extends SettingsDomainError {
  constructor(message: string) {
    super('INVALID_BRANCH_STATE', message);
  }
}

export class FiscalPeriodNotFoundError extends SettingsDomainError {
  constructor(periodId: string) {
    super('FISCAL_PERIOD_NOT_FOUND', `Fiscal period '${periodId}' was not found.`);
  }
}

export class FiscalPeriodClosedError extends SettingsDomainError {
  constructor(dateIso: string, periodId?: string) {
    super(
      'FISCAL_PERIOD_CLOSED',
      periodId
        ? `Operation date '${dateIso}' falls within locked/closed fiscal period '${periodId}'.`
        : `Operation date '${dateIso}' does not belong to an open fiscal period.`,
    );
  }
}

export class InvalidFiscalPeriodStateError extends SettingsDomainError {
  constructor(message: string) {
    super('INVALID_FISCAL_PERIOD_STATE', message);
  }
}

export class SettingTypeMismatchError extends SettingsDomainError {
  constructor(key: string, expectedType: string) {
    super('SETTING_TYPE_MISMATCH', `Setting '${key}' expects a value of type '${expectedType}'.`);
  }
}

export class SettingsConcurrencyError extends SettingsDomainError {
  constructor(entityType: string, id: string, expectedVersion: number) {
    super(
      'SETTINGS_CONCURRENCY_ERROR',
      `Optimistic concurrency conflict on ${entityType} '${id}' (expected version ${expectedVersion}).`,
    );
  }
}

export class SettingsFeatureDisabledError extends SettingsDomainError {
  constructor(feature: string) {
    super('SETTINGS_FEATURE_DISABLED', `Settings feature '${feature}' is disabled for this profile.`);
  }
}
