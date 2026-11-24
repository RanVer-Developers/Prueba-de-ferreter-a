import { z } from 'zod';
import {
  apportionByWeights,
  currencyDecimals as sharedCurrencyDecimals,
  decimalToCentsHalfEven,
  divideHalfEven,
  MICRO_SCALE,
  MoneyErrorHandlers,
  multiplyCentsHalfEven,
  normalizeCurrencyCode,
} from '@modulos/core-shared';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/inventory-errors.js';

const INVENTORY_MONEY_ERRORS: MoneyErrorHandlers = {
  invalidAmount: (amount, reason) => new InvalidMoneyAmountError(amount, reason),
  currencyMismatch: (expected, actual) => new CurrencyMismatchError(expected, actual),
};

export function currencyDecimals(currency: string): number {
  return sharedCurrencyDecimals(currency);
}

export interface MoneyJSON {
  cents: number;
  currency: string;
}

const MoneyJSONPayloadSchema = z.object({
  cents: z.number().int().refine(Number.isSafeInteger, {
    message: 'El valor en unidades menores debe ser un entero seguro.',
  }),
  currency: z.string().trim().min(1),
});

/**
 * Value Object inmutable para montos monetarios en inventario (costos unitarios, totales y valorizaciones).
 * Delega la aritmética exacta (ISO 4217 + ROUND_HALF_EVEN) a `@modulos/core-shared`.
 */
export class Money {
  private readonly _cents: number;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(cents: number, currency = 'USD') {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyAmountError(cents, 'El valor en unidades menores debe ser un número entero seguro.');
    }
    this.currency = normalizeCurrencyCode(currency, INVENTORY_MONEY_ERRORS);
    this._cents = cents === 0 ? 0 : cents;
    this.decimals = currencyDecimals(this.currency);
  }

  public static fromDecimal(amount: number, currency = 'USD'): Money {
    const normalized = normalizeCurrencyCode(currency, INVENTORY_MONEY_ERRORS);
    const cents = decimalToCentsHalfEven(amount, normalized, INVENTORY_MONEY_ERRORS);
    return new Money(cents, normalized);
  }

  public static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(cents, currency);
  }

  public static fromJSON(json: MoneyJSON): Money {
    const parsed = MoneyJSONPayloadSchema.safeParse(json);
    if (!parsed.success) {
      const candidateCents = typeof json?.cents === 'number' ? json.cents : 0;
      throw new InvalidMoneyAmountError(candidateCents, 'Payload MoneyJSON inválido.');
    }
    return new Money(parsed.data.cents, parsed.data.currency);
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
    const cents = multiplyCentsHalfEven(this._cents, factor, INVENTORY_MONEY_ERRORS);
    return new Money(cents, this.currency);
  }

  public multiplyRatio(numerator: number, denominator: number): Money {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      throw new InvalidMoneyAmountError(numerator, 'El numerador y denominador del ratio deben ser enteros seguros.');
    }
    const cents = divideHalfEven(BigInt(this._cents) * BigInt(numerator), BigInt(denominator), INVENTORY_MONEY_ERRORS);
    return new Money(cents, this.currency);
  }

  public multiplyMicro(microValue: number, scale = MICRO_SCALE): Money {
    return this.multiplyRatio(microValue, scale);
  }

  public allocateByWeights(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new InvalidMoneyAmountError(0, 'Los pesos de reparto no pueden estar vacíos.');
    }
    const totalWeight = weights.reduce((acc, w) => acc + (Number.isFinite(w) && w > 0 ? w : 0), 0);
    if (totalWeight <= 0) {
      throw new InvalidMoneyAmountError(0, 'El peso total de reparto debe ser positivo.');
    }
    const sign = this._cents < 0 ? -1 : 1;
    const absCents = Math.abs(this._cents);
    const parts = apportionByWeights(absCents, weights, INVENTORY_MONEY_ERRORS);
    return parts.map((c) => new Money(sign * c, this.currency));
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

  public format(locale = 'es-ES'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals,
    }).format(this.toDecimal());
  }

  public toJSON(): MoneyJSON {
    return {
      cents: this._cents,
      currency: this.currency,
    };
  }

  public toString(): string {
    return `${this.toDecimal().toFixed(this.decimals)} ${this.currency}`;
  }
}
