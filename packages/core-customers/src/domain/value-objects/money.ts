import {
  currencyDecimals,
  divideHalfEven as sharedDivideHalfEven,
  MICRO_SCALE,
  Money as SharedMoney,
  type MoneyJSON,
  SharedDomainError,
} from '@modulos/core-shared';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/customer-errors.js';

export { currencyDecimals, type MoneyJSON };

function wrapSharedError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof SharedDomainError) {
      throw new InvalidMoneyAmountError(0, error.message);
    }
    throw error;
  }
}

export function divideHalfEven(numerator: bigint, denominator: bigint): number {
  return wrapSharedError(() => sharedDivideHalfEven(numerator, denominator));
}

export class Money {
  private readonly inner: SharedMoney;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(inner: SharedMoney) {
    this.inner = inner;
    this.currency = inner.currency;
    this.decimals = inner.decimals;
  }

  public static fromCents(cents: number, currency = 'MXN'): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromCents(cents, currency)));
  }

  public static fromDecimal(amount: number, currency = 'MXN'): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromDecimal(amount, currency)));
  }

  public static fromJSON(json: MoneyJSON): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromJSON(json)));
  }

  public static zero(currency = 'MXN'): Money {
    return new Money(wrapSharedError(() => SharedMoney.zero(currency)));
  }

  public toCents(): number {
    return this.inner.toCents();
  }

  public toDecimal(): number {
    return this.inner.toDecimal();
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  public add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(wrapSharedError(() => this.inner.add(other.inner)));
  }

  public subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(wrapSharedError(() => this.inner.subtract(other.inner)));
  }

  public multiply(factor: number): Money {
    return new Money(wrapSharedError(() => this.inner.multiply(factor)));
  }

  public multiplyRatio(numerator: number, denominator: number): Money {
    return new Money(wrapSharedError(() => this.inner.multiplyRatio(numerator, denominator)));
  }

  public multiplyMicro(microValue: number, scale = MICRO_SCALE): Money {
    return this.multiplyRatio(microValue, scale);
  }

  public allocateByWeights(weights: readonly number[]): Money[] {
    return wrapSharedError(() => this.inner.allocateByWeights(weights).map((m) => new Money(m)));
  }

  public isZero(): boolean {
    return this.inner.isZero();
  }

  public isPositive(): boolean {
    return this.inner.isPositive();
  }

  public isNegative(): boolean {
    return this.inner.isNegative();
  }

  public equals(other: Money): boolean {
    return this.inner.equals(other.inner);
  }

  public greaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.inner.greaterThan(other.inner);
  }

  public greaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.inner.greaterThanOrEqual(other.inner);
  }

  public lessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.inner.lessThan(other.inner);
  }

  public lessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.inner.lessThanOrEqual(other.inner);
  }

  public format(locale = 'es-ES'): string {
    return this.inner.format(locale);
  }

  public toJSON(): MoneyJSON {
    return this.inner.toJSON();
  }

  public toString(): string {
    return this.inner.toString();
  }
}
