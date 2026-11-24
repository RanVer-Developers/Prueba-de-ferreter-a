import {
  apportionByWeights,
  currencyDecimals as sharedCurrencyDecimals,
  decimalToCentsHalfEven,
  MoneyErrorHandlers,
  multiplyCentsHalfEven,
  normalizeCurrencyCode,
} from '@modulos/core-shared';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/cashier-errors.js';

const CASHIER_MONEY_ERRORS: MoneyErrorHandlers = {
  invalidAmount: (amount, reason) => new InvalidMoneyAmountError(amount, reason),
  currencyMismatch: (expected, actual) => new CurrencyMismatchError(expected, actual),
};

export function currencyDecimals(currency: string): number {
  return sharedCurrencyDecimals(currency);
}

/**
 * Value Object para el manejo inmutable y seguro de montos monetarios.
 * Almacena los valores internamente en unidades menores enteras (centavos en USD, yenes en JPY,
 * fils en KWD) delegando la aritmética exacta (ISO 4217 + ROUND_HALF_EVEN) a `@modulos/core-shared`.
 */
export class Money {
  private readonly _cents: number;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(cents: number, currency = 'USD') {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyAmountError(cents, 'El valor en unidades menores debe ser un número entero seguro.');
    }
    this.currency = normalizeCurrencyCode(currency, CASHIER_MONEY_ERRORS);
    this._cents = cents === 0 ? 0 : cents;
    this.decimals = currencyDecimals(this.currency);
  }

  public static fromDecimal(amount: number, currency = 'USD'): Money {
    const normalized = normalizeCurrencyCode(currency, CASHIER_MONEY_ERRORS);
    const cents = decimalToCentsHalfEven(amount, normalized, CASHIER_MONEY_ERRORS);
    return new Money(cents, normalized);
  }

  public static fromJSON(json: { cents: number; currency: string }): Money {
    return new Money(json.cents, json.currency);
  }

  public static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(cents, currency);
  }

  public static zero(currency = 'USD'): Money {
    return new Money(0, currency);
  }

  public toCents(): number {
    return this._cents;
  }

  public toDecimal(): number {
    return this._cents / Math.pow(10, this.decimals);
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  public add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this._cents + other._cents, this.currency);
  }

  public subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this._cents - other._cents, this.currency);
  }

  public multiply(factor: number): Money {
    const newCents = multiplyCentsHalfEven(this._cents, factor, CASHIER_MONEY_ERRORS);
    return new Money(newCents, this.currency);
  }

  public isZero(): boolean {
    return this._cents === 0;
  }

  public isPositive(): boolean {
    return this._cents > 0;
  }

  public isNegative(): boolean {
    return this._cents < 0;
  }

  public equals(other: Money): boolean {
    return this.currency === other.currency && this._cents === other._cents;
  }

  public greaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._cents > other._cents;
  }

  public greaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._cents >= other._cents;
  }

  public lessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._cents < other._cents;
  }

  public lessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._cents <= other._cents;
  }

  public allocate(ratios: number[]): Money[] {
    if (!Array.isArray(ratios) || ratios.length === 0 || ratios.some((r) => typeof r !== 'number' || !isFinite(r) || r < 0)) {
      throw new InvalidMoneyAmountError(this.toDecimal(), 'Los ratios de reparto deben ser números no negativos.');
    }
    const totalRatio = ratios.reduce((a, b) => a + b, 0);
    if (totalRatio <= 0) {
      throw new InvalidMoneyAmountError(this.toDecimal(), 'La suma de ratios de reparto debe ser mayor a cero.');
    }
    const sign = this._cents < 0 ? -1 : 1;
    const absCents = Math.abs(this._cents);
    const shares = apportionByWeights(absCents, ratios, CASHIER_MONEY_ERRORS);
    return shares.map((c) => new Money(sign * c, this.currency));
  }

  public format(locale = 'es-ES'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals,
    }).format(this.toDecimal());
  }

  public toJSON(): { amount: number; cents: number; currency: string } {
    return {
      amount: this.toDecimal(),
      cents: this._cents,
      currency: this.currency,
    };
  }

  public toString(): string {
    return `${this.toDecimal().toFixed(this.decimals)} ${this.currency}`;
  }
}
