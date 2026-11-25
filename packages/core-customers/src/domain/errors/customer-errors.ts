/**
 * Base domain error for all exceptions in @modulos/core-customers.
 */
export class CustomerDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCustomerInputError extends CustomerDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class InvalidMoneyAmountError extends CustomerDomainError {
  constructor(public readonly amount: number, details?: string) {
    super(`Invalid money amount (${amount}).${details ? ` ${details}` : ''}`);
  }
}

export class CurrencyMismatchError extends CustomerDomainError {
  constructor(public readonly expectedCurrency: string, public readonly actualCurrency: string) {
    super(`Currency mismatch: expected '${expectedCurrency}', received '${actualCurrency}'.`);
  }
}

export class CustomerNotFoundError extends CustomerDomainError {
  constructor(identifier: string) {
    super(`Customer '${identifier}' was not found.`);
  }
}

export class DuplicateCustomerError extends CustomerDomainError {
  constructor(field: 'id' | 'code' | 'email' | 'taxId', value: string) {
    super(`Customer with ${field} '${value}' already exists.`);
  }
}

export class CustomerBlockedError extends CustomerDomainError {
  constructor(customerId: string, status: string) {
    super(`Customer '${customerId}' cannot operate in status '${status}'.`);
  }
}

export class CreditAccountFrozenError extends CustomerDomainError {
  constructor(customerId: string, reason?: string) {
    super(`Credit account for customer '${customerId}' is frozen.${reason ? ` Reason: ${reason}` : ''}`);
  }
}

export class CreditLimitExceededError extends CustomerDomainError {
  constructor(
    public readonly customerId: string,
    public readonly requestedCents: number,
    public readonly availableCents: number
  ) {
    super(
      `Credit limit exceeded for customer '${customerId}': requested ${requestedCents} cents, available ${availableCents} cents.`
    );
  }
}

export class InsufficientCreditBalanceError extends CustomerDomainError {
  constructor(customerId: string, paymentCents: number, balanceCents: number) {
    super(
      `Payment (${paymentCents} cents) exceeds outstanding credit balance (${balanceCents} cents) for customer '${customerId}'.`
    );
  }
}

export class InsufficientWalletBalanceError extends CustomerDomainError {
  constructor(customerId: string, requestedCents: number, availableCents: number) {
    super(
      `Insufficient wallet balance for customer '${customerId}': requested ${requestedCents} cents, available ${availableCents} cents.`
    );
  }
}

export class InsufficientLoyaltyPointsError extends CustomerDomainError {
  constructor(customerId: string, requestedPoints: number, availablePoints: number) {
    super(
      `Insufficient loyalty points for customer '${customerId}': requested ${requestedPoints}, available ${availablePoints}.`
    );
  }
}

export class CustomerBalanceNotSettledError extends CustomerDomainError {
  constructor(customerId: string, details: string) {
    super(`Cannot anonymize customer '${customerId}' with unsettled balances: ${details}`);
  }
}

export class ConcurrencyError extends CustomerDomainError {
  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict on Customer '${entityId}': expected version ${expectedVersion}, actual ${actualVersion}.`
    );
  }
}

export class FeatureDisabledError extends CustomerDomainError {
  constructor(public readonly feature: string, details?: string) {
    super(
      details
        ? `Customer feature '${feature}' is disabled: ${details}`
        : `Customer feature '${feature}' is disabled in the active profile.`
    );
  }
}
