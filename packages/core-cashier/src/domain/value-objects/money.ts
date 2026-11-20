import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/cashier-errors.js';

/**
 * Decimales de la unidad menor por moneda (ISO 4217).
 * Las monedas no listadas usan 2 decimales.
 */
const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  // 0 decimales
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // 3 decimales
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // 4 decimales
  CLF: 4, UYW: 4,
};

/**
 * Retorna la cantidad de decimales de la unidad menor de una moneda (JPY=0, USD=2, KWD=3).
 */
export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase().trim()] ?? 2;
}

/**
 * Value Object para el manejo inmutable y seguro de montos monetarios.
 * Almacena los valores internamente en unidades menores enteras (centavos en USD, yenes en JPY,
 * fils en KWD) para erradicar errores de precisión de punto flotante en cálculos contables.
 * La cantidad de decimales depende de la moneda (ISO 4217).
 */
export class Money {
  private readonly _cents: number;
  public readonly currency: string;
  public readonly decimals: number;

  private constructor(cents: number, currency = 'USD') {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyAmountError(cents, 'El valor en unidades menores debe ser un número entero seguro.');
    }
    this._cents = cents;
    this.currency = currency.toUpperCase().trim();
    this.decimals = currencyDecimals(this.currency);
  }

  /**
   * Crea una instancia de Money a partir de un valor decimal (ej: 19.99).
   */
  public static fromDecimal(amount: number, currency = 'USD'): Money {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      throw new InvalidMoneyAmountError(amount, 'Debe ser un número válido.');
    }
    // Multiplicamos y redondeamos para evitar 19.99 * 100 = 1998.9999999999998
    const factor = Math.pow(10, currencyDecimals(currency));
    const cents = Math.round(Number((amount * factor).toPrecision(15)));
    return new Money(cents, currency);
  }

  /**
   * Reconstruye un Money desde su representación JSON ({ cents, currency }).
   */
  public static fromJSON(json: { cents: number; currency: string }): Money {
    return new Money(json.cents, json.currency);
  }

  /**
   * Crea una instancia de Money a partir de centavos enteros (ej: 1999).
   */
  public static fromCents(cents: number, currency = 'USD'): Money {
    return new Money(cents, currency);
  }

  /**
   * Retorna una instancia con monto cero.
   */
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
    if (typeof factor !== 'number' || isNaN(factor)) {
      throw new InvalidMoneyAmountError(factor, 'El factor multiplicador debe ser numérico.');
    }
    const newCents = Math.round(this._cents * factor);
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

  /**
   * Reparte el monto en partes proporcionales a los ratios dados sin perder ni crear unidades menores
   * (el remanente se asigna de a una unidad menor a las primeras partes). Ej.: 100.00 / [1,1,1] => 33.34, 33.33, 33.33.
   */
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
    const shares = ratios.map((r) => Math.floor((absCents * r) / totalRatio));
    let remainder = absCents - shares.reduce((a, b) => a + b, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % shares.length) {
      if (ratios[i] > 0) {
        shares[i] += 1;
        remainder -= 1;
      }
    }
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
