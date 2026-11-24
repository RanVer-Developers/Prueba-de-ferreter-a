/**
 * Base domain error for all exceptions in the reports & analytics module.
 */
export class ReportDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidReportInputError extends ReportDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class ReportFeatureDisabledError extends ReportDomainError {
  public readonly feature: string;

  constructor(feature: string, details?: string) {
    super(
      details
        ? `Feature '${feature}' is disabled in the active report profile: ${details}`
        : `Feature '${feature}' is disabled in the active report profile.`
    );
    this.feature = feature;
  }
}

export class InvalidReportPeriodError extends ReportDomainError {
  constructor(reason: string) {
    super(`Invalid report period: ${reason}`);
  }
}

export class ReportCurrencyMismatchError extends ReportDomainError {
  constructor(expected: string, received: string) {
    super(`Report currency mismatch: expected '${expected}', received '${received}'.`);
  }
}

export class ReportDefinitionNotFoundError extends ReportDomainError {
  constructor(definitionId: string) {
    super(`Report definition '${definitionId}' was not found.`);
  }
}

export class UnsupportedExportFormatError extends ReportDomainError {
  constructor(format: string) {
    super(`Unsupported report export format '${format}'.`);
  }
}
