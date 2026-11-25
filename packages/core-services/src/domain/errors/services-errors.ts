export class ServicesDomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidServicesInputError extends ServicesDomainError {
  constructor(message: string) {
    super('INVALID_SERVICES_INPUT', message);
  }
}

export class ServiceOrderNotFoundError extends ServicesDomainError {
  constructor(orderId: string) {
    super('SERVICE_ORDER_NOT_FOUND', `Service order '${orderId}' was not found.`);
  }
}

export class InvalidServiceOrderStateError extends ServicesDomainError {
  constructor(orderId: string, currentStatus: string, targetOrAction: string) {
    super(
      'INVALID_SERVICE_ORDER_STATE',
      `Cannot ${targetOrAction} service order '${orderId}' while in status '${currentStatus}'.`,
    );
  }
}

export class ServiceFeatureDisabledError extends ServicesDomainError {
  constructor(feature: string) {
    super('SERVICE_FEATURE_DISABLED', `Service feature '${feature}' is disabled for this profile.`);
  }
}

export class ServicesConcurrencyError extends ServicesDomainError {
  constructor(orderId: string, expectedVersion: number) {
    super(
      'SERVICES_CONCURRENCY_ERROR',
      `Optimistic concurrency conflict on service order '${orderId}' (expected version ${expectedVersion}).`,
    );
  }
}
