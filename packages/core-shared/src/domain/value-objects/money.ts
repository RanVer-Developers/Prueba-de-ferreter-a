import { z } from 'zod';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/shared-errors.js';

/**
 * Minor unit decimals per ISO 4217 currency code.
 * Unlisted currencies default to 2 decimals.
 */
export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  // 0 decimals
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // 3 decimals
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // 4 decimals
  CLF: 4, UYW: 4,
};

export interface MoneyErrorHandlers {
  invalidAmount: (amount: number, reason: string) => Error;
  currencyMismatch: (expected: string, actual: string) => Error;
}

export const DEFAULT_MONEY_ERROR_HANDLERS: MoneyErrorHandlers = {
  invalidAmount: (amount, reason) => new InvalidMoneyAmountError(amount, reason),
  currencyMismatch: (expected, actual) => new CurrencyMismatchError(expected, actual),
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase().trim()] ?? 2;
}

export function normalizeCurrencyCode(
  currency: string,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): string {
  if (typeof currency !== 'string') {
    throw handlers.invalidAmount(0, 'Currency code must be a string.');
  }
  const normalized = currency.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw handlers.invalidAmount(0, `Invalid ISO 4217 currency code '${currency}'.`);
  }
  return normalized;
}

/**
 * Exact BigInt Banker's Rounding (ROUND_HALF_EVEN) for rational division `numerator / denominator`.
 */
export function divideHalfEven(
  numerator: bigint,
  denominator: bigint,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): number {
  if (denominator === 0n) {
    throw handlers.invalidAmount(0, 'Division by zero is not allowed.');
  }

  let num = numerator;
  let den = denominator;
  if (den < 0n) {
    num = -num;
    den = -den;
  }

  const negative = num < 0n;
  const absNum = negative ? -num : num;
  const quotient = absNum / den;
  const remainder = absNum % den;
  const doubleRemainder = remainder * 2n;

  let rounded = quotient;
  if (doubleRemainder > den) {
    rounded = quotient + 1n;
  } else if (doubleRemainder === den && quotient % 2n === 1n) {
    rounded = quotient + 1n;
  }

  const signed = negative ? -rounded : rounded;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) {
    throw handlers.invalidAmount(result, 'Resulting minor unit amount exceeds safe integer range.');
  }
  return result === 0 ? 0 : result;
}

/**
 * Banker's Rounding (ROUND_HALF_EVEN) for finite floating-point numbers.
 */
export function roundHalfEven(
  value: number,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw handlers.invalidAmount(value, 'Value must be a finite number.');
  }
  if (value === 0) return 0;

  const negative = value < 0;
  const abs = Math.abs(value);
  const floor = Math.floor(abs);
  const fraction = abs - floor;

  let rounded: number;
  if (fraction > 0.5) {
    rounded = floor + 1;
  } else if (fraction < 0.5) {
    rounded = floor;
  } else {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }

  const result = negative ? -rounded : rounded;
  return result === 0 ? 0 : result;
}

export const MICRO_SCALE = 1_000_000;
export const MICRO_SCALE_BIGINT = 1_000_000n;

/**
 * Scales a finite decimal factor to integer micro-units (1e6) with ROUND_HALF_EVEN and safe-integer checks.
 */
export function scaleFactorMicro(
  factor: number,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): bigint {
  if (typeof factor !== 'number' || Number.isNaN(factor) || !Number.isFinite(factor)) {
    throw handlers.invalidAmount(factor, 'Factor must be a finite number.');
  }
  const scaledNum = Number((factor * MICRO_SCALE).toPrecision(15));
  if (!Number.isFinite(scaledNum) || Math.abs(scaledNum) > Number.MAX_SAFE_INTEGER) {
    throw handlers.invalidAmount(factor, 'Scaled factor exceeds safe integer range.');
  }
  const rounded = roundHalfEven(scaledNum, handlers);
  if (!Number.isSafeInteger(rounded)) {
    throw handlers.invalidAmount(factor, 'Scaled factor exceeds safe integer range.');
  }
  return BigInt(rounded);
}

/**
 * Multiplies integer minor units by a finite decimal factor using 1e6 precision and ROUND_HALF_EVEN.
 */
export function multiplyCentsHalfEven(
  cents: number,
  factor: number,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): number {
  if (!Number.isSafeInteger(cents)) {
    throw handlers.invalidAmount(cents, 'Minor units must be a safe integer.');
  }
  const scaledFactor = scaleFactorMicro(factor, handlers);
  return divideHalfEven(BigInt(cents) * scaledFactor, MICRO_SCALE_BIGINT, handlers);
}

/**
 * Converts a decimal currency amount into safe integer minor units using ROUND_HALF_EVEN.
 */
export function decimalToCentsHalfEven(
  amount: number,
  currency: string,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): number {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount)) {
    throw handlers.invalidAmount(amount, 'Amount must be a finite number.');
  }
  const normalizedCurrency = normalizeCurrencyCode(currency, handlers);
  const factor = Math.pow(10, currencyDecimals(normalizedCurrency));
  const scaled = Number((amount * factor).toPrecision(15));
  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    throw handlers.invalidAmount(amount, 'Resulting minor unit amount exceeds safe integer range.');
  }
  const cents = roundHalfEven(scaled, handlers);
  if (!Number.isSafeInteger(cents)) {
    throw handlers.invalidAmount(amount, 'Resulting minor unit amount exceeds safe integer range.');
  }
  return cents;
}

/**
 * Apportions an integer total across non-negative weights using the Largest Remainder Method (Hamilton).
 * Guarantees that the sum of returned parts equals `totalCents` to the exact cent.
 */
export function apportionByWeights(
  totalCents: number,
  weights: ReadonlyArray<number>,
  handlers: MoneyErrorHandlers = DEFAULT_MONEY_ERROR_HANDLERS
): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw handlers.invalidAmount(totalCents, 'Total to apportion must be a non-negative safe integer.');
  }
  if (weights.length === 0) {
    return [];
  }
  if (totalCents === 0) {
    return weights.map(() => 0);
  }

  const scaledWeights = weights.map((w) => {
    if (typeof w !== 'number' || Number.isNaN(w) || !Number.isFinite(w) || w < 0) {
      throw handlers.invalidAmount(w, 'Apportionment weights must be finite non-negative numbers.');
    }
    return scaleFactorMicro(w, handlers);
  });

  const weightSum = scaledWeights.reduce((acc, w) => acc + w, 0n);
  if (weightSum === 0n) {
    return weights.map(() => 0);
  }

  const totalBig = BigInt(totalCents);
  const allocations: number[] = new Array<number>(weights.length).fill(0);
  const remainders: Array<{ index: number; remainder: bigint }> = [];
  let allocatedSum = 0;

  for (let i = 0; i < scaledWeights.length; i++) {
    const w = scaledWeights[i];
    if (w === undefined) continue;
    const num = totalBig * w;
    const base = Number(num / weightSum);
    const remainder = num % weightSum;
    allocations[i] = base;
    allocatedSum += base;
    remainders.push({ index: i, remainder });
  }

  const leftover = totalCents - allocatedSum;
  remainders.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder > a.remainder ? 1 : -1;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < leftover; i++) {
    const entry = remainders[i];
    if (entry !== undefined) {
      allocations[entry.index] = (allocations[entry.index] ?? 0) + 1;
    }
  }

  return allocations;
}

export interface MoneyJSON {
  cents: number;
  currency: string;
}

const MoneyJSONPayloadSchema = z.object({
  cents: z.number().int().refine(Number.isSafeInteger, {
    message: 'Minor unit value must be a safe integer.',
  }),
  currency: z.string().trim().min(1),
});

export class Money {
  private readonly _cents: number;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(cents: number, currency = 'USD') {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyAmountError(cents, 'Minor unit value must be a safe integer.');
    }
    const normalizedCurrency = normalizeCurrencyCode(currency);
    this._cents = cents === 0 ? 0 : cents;
    this.currency = normalizedCurrency;
    this.decimals = currencyDecimals(this.currency);
  }

  public static fromDecimal(amount: number, currency = 'USD'): Money {
    const normalizedCurrency = normalizeCurrencyCode(currency);
    return new Money(decimalToCentsHalfEven(amount, normalizedCurrency), normalizedCurrency);
  }

  public static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(cents, currency);
  }

  public static fromJSON(json: MoneyJSON): Money {
    const parsed = MoneyJSONPayloadSchema.safeParse(json);
    if (!parsed.success) {
      const candidateCents = typeof json?.cents === 'number' ? json.cents : 0;
      throw new InvalidMoneyAmountError(candidateCents, 'Invalid MoneyJSON payload.');
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
    return new Money(multiplyCentsHalfEven(this._cents, factor), this.currency);
  }

  public multiplyRatio(numerator: number, denominator: number): Money {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      throw new InvalidMoneyAmountError(numerator, 'Ratio numerator and denominator must be safe integers.');
    }
    const cents = divideHalfEven(BigInt(this._cents) * BigInt(numerator), BigInt(denominator));
    return new Money(cents, this.currency);
  }

  public multiplyMicro(microValue: number, scale = MICRO_SCALE): Money {
    return this.multiplyRatio(microValue, scale);
  }

  public allocateByWeights(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new InvalidMoneyAmountError(0, 'Weights array cannot be empty.');
    }
    const totalWeight = weights.reduce((acc, w) => acc + (Number.isFinite(w) && w > 0 ? w : 0), 0);
    if (totalWeight <= 0) {
      throw new InvalidMoneyAmountError(0, 'Total allocation weight must be positive.');
    }
    const sign = this._cents < 0 ? -1 : 1;
    const absCents = Math.abs(this._cents);
    const parts = apportionByWeights(absCents, weights);
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
