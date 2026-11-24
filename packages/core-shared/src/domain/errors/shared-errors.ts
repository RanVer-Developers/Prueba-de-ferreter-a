export class SharedDomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class InvalidMoneyAmountError extends SharedDomainError {
  constructor(amount: number, reason = 'Must be a valid finite number.') {
    super('INVALID_MONEY_AMOUNT', `Invalid monetary amount (${amount}): ${reason}`);
  }
}

export class CurrencyMismatchError extends SharedDomainError {
  constructor(expected: string, actual: string) {
    super('CURRENCY_MISMATCH', `Currency mismatch: expected ${expected}, got ${actual}.`);
  }
}
