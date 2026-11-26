/**
 * Base domain error for all exceptions in the orders module.
 */
export class OrderDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidOrderInputError extends OrderDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class InvalidMoneyAmountError extends OrderDomainError {
  constructor(value: number, reason: string) {
    super(`Invalid monetary amount (${value}): ${reason}`);
  }
}

export class CurrencyMismatchError extends OrderDomainError {
  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected '${expected}', received '${received}'.`);
  }
}

export class OrderNotFoundError extends OrderDomainError {
  constructor(orderId: string) {
    super(`Order '${orderId}' was not found.`);
  }
}

export class InvalidOrderStateError extends OrderDomainError {
  constructor(orderId: string, currentStatus: string, operation: string) {
    super(`Cannot execute '${operation}' on order '${orderId}' while in status '${currentStatus}'.`);
  }
}

export class EmptyOrderError extends OrderDomainError {
  constructor(orderId: string, operation: string) {
    super(`Cannot execute '${operation}' on empty order '${orderId}' without line items.`);
  }
}

export class OrderLineNotFoundError extends OrderDomainError {
  constructor(orderId: string, lineId: string) {
    super(`Line item '${lineId}' was not found in order '${orderId}'.`);
  }
}

export class DuplicateOrderLineError extends OrderDomainError {
  constructor(orderId: string, lineId: string) {
    super(`Line item '${lineId}' already exists in order '${orderId}'.`);
  }
}

export class DiscountNotFoundError extends OrderDomainError {
  constructor(discountId: string, scope: string) {
    super(`Discount '${discountId}' was not found in ${scope}.`);
  }
}

export class InvalidDiscountError extends OrderDomainError {
  constructor(reason: string) {
    super(`Invalid discount: ${reason}`);
  }
}

export class InvalidCouponError extends OrderDomainError {
  constructor(code: string, reason: string) {
    super(`Invalid coupon '${code}': ${reason}`);
  }
}

export class InvalidTaxRuleError extends OrderDomainError {
  constructor(reason: string) {
    super(`Invalid tax rule: ${reason}`);
  }
}

export class ConcurrencyError extends OrderDomainError {
  constructor(entityId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Concurrency conflict on order '${entityId}': expected persisted version ${expectedVersion}, found ${currentVersion}.`
    );
  }
}

export class FeatureDisabledError extends OrderDomainError {
  public readonly feature: string;

  constructor(feature: string, details?: string) {
    super(
      details
        ? `Feature '${feature}' is disabled in the active profile: ${details}`
        : `Feature '${feature}' is disabled in the active order profile.`
    );
    this.feature = feature;
  }
}
