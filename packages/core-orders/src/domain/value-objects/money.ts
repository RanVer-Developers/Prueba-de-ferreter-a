import {
  apportionByWeights as sharedApportionByWeights,
  currencyDecimals,
  divideHalfEven as sharedDivideHalfEven,
  MICRO_SCALE,
  Money as SharedMoney,
  multiplyCentsHalfEven as sharedMultiplyCentsHalfEven,
  roundHalfEven as sharedRoundHalfEven,
  SharedDomainError,
} from '@modulos/core-shared';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/order-errors.js';

export { currencyDecimals };

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

/**
 * Exact BigInt division with Banker's Rounding (ROUND_HALF_EVEN).
 */
export function divideHalfEven(numerator: bigint, denominator: bigint): number {
  return wrapSharedError(() => sharedDivideHalfEven(numerator, denominator));
}

/**
 * Banker's Rounding (ROUND_HALF_EVEN) for floating point numbers.
 */
export function roundHalfEven(value: number): number {
  return wrapSharedError(() => sharedRoundHalfEven(value));
}

/**
 * Multiplies integer minor units by a decimal factor using 1e6 precision and ROUND_HALF_EVEN.
 */
export function multiplyCentsHalfEven(cents: number, factor: number): number {
  return wrapSharedError(() => sharedMultiplyCentsHalfEven(cents, factor));
}

/**
 * Apportions an integer total across non-negative weights using the Largest Remainder Method (Hamilton).
 * Guarantees that the sum of returned parts equals `totalCents` to the exact cent.
 */
export function apportionByWeights(totalCents: number, weights: ReadonlyArray<number>): number[] {
  return wrapSharedError(() => sharedApportionByWeights(totalCents, weights));
}

export interface MoneyJSON {
  cents: number;
  currency: string;
}

/**
 * Immutable Value Object for monetary amounts stored as safe integer minor units (cents).
 */
export class Money {
  private readonly inner: SharedMoney;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(inner: SharedMoney) {
    this.inner = inner;
    this.currency = inner.currency;
    this.decimals = inner.decimals;
  }

  public static fromDecimal(amount: number, currency = 'USD'): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromDecimal(amount, currency)));
  }

  public static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromCents(cents, currency)));
  }

  public static fromJSON(json: MoneyJSON): Money {
    return new Money(wrapSharedError(() => SharedMoney.fromJSON(json)));
  }

  public static zero(currency = 'USD'): Money {
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
