import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/cashier-errors.js';
import { Money } from './money.js';

export interface ExchangeRateProps {
  fromCurrency: string;
  toCurrency: string;
  rate: number; // Tasa multiplicadora: 1 unidad de fromCurrency = rate unidades de toCurrency
  asOf?: Date;
}

export interface ExchangeRateJSON {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: string;
}

/**
 * Value Object para la gestión de tasas de cambio y operaciones multimoneda.
 */
export class ExchangeRate {
  public readonly fromCurrency: string;
  public readonly toCurrency: string;
  public readonly rate: number;
  public readonly asOf: Date;

  public constructor(props: ExchangeRateProps) {
    if (typeof props.rate !== 'number' || isNaN(props.rate) || props.rate <= 0) {
      throw new InvalidMoneyAmountError(props.rate, 'La tasa de cambio debe ser un número estrictamente positivo.');
    }

    this.fromCurrency = props.fromCurrency.toUpperCase().trim();
    this.toCurrency = props.toCurrency.toUpperCase().trim();
    this.rate = props.rate;
    this.asOf = props.asOf || new Date();
  }

  /**
   * Convierte un monto en moneda extranjera a la moneda base.
   */
  public convertToBase(foreignMoney: Money): Money {
    if (foreignMoney.currency !== this.fromCurrency) {
      throw new CurrencyMismatchError(this.fromCurrency, foreignMoney.currency);
    }

    // Convertir respetando los decimales distintos de cada moneda (ej. USD 2 -> JPY 0)
    const targetDecimals = Money.zero(this.toCurrency).decimals;
    const factor = Math.pow(10, targetDecimals);
    const targetMinor = Math.round(Number((foreignMoney.toDecimal() * this.rate * factor).toPrecision(15)));
    return Money.fromCents(targetMinor, this.toCurrency);
  }

  /**
   * Convierte un monto en moneda base hacia la moneda extranjera.
   */
  public convertFromBase(baseMoney: Money): Money {
    if (baseMoney.currency !== this.toCurrency) {
      throw new CurrencyMismatchError(this.toCurrency, baseMoney.currency);
    }

    const foreignDecimals = Money.zero(this.fromCurrency).decimals;
    const factor = Math.pow(10, foreignDecimals);
    const foreignMinor = Math.round(Number(((baseMoney.toDecimal() / this.rate) * factor).toPrecision(15)));
    return Money.fromCents(foreignMinor, this.fromCurrency);
  }

  public static fromJSON(json: ExchangeRateJSON): ExchangeRate {
    return new ExchangeRate({
      fromCurrency: json.fromCurrency,
      toCurrency: json.toCurrency,
      rate: json.rate,
      asOf: new Date(json.asOf),
    });
  }

  public toJSON(): ExchangeRateJSON {
    return {
      fromCurrency: this.fromCurrency,
      toCurrency: this.toCurrency,
      rate: this.rate,
      asOf: this.asOf.toISOString(),
    };
  }
}
