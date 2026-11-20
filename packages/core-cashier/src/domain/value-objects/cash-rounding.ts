import { InvalidCashierInputError } from '../errors/cashier-errors.js';
import { Money } from './money.js';

export type RoundingMode = 'HALF_UP' | 'DOWN' | 'UP';

export interface CashRoundingConfig {
  /** Incremento decimal mínimo en efectivo (ej. 0.05, 0.10, 0.50, 1.00). */
  increment: number;
  mode?: RoundingMode;
}

export interface CashRoundingResult {
  original: Money;
  rounded: Money;
  /** Diferencia aplicada: `rounded - original` (positiva si se redondeó hacia arriba, negativa si hacia abajo). */
  adjustment: Money;
}

/**
 * Política de redondeo para pagos en efectivo (ej. países sin monedas de 1 o 5 centavos).
 * Aplica únicamente al componente en efectivo sin alterar pagos electrónicos.
 */
export class CashRoundingPolicy {
  public readonly increment: number;
  public readonly mode: RoundingMode;

  public constructor(increment: number, mode: RoundingMode = 'HALF_UP') {
    if (typeof increment !== 'number' || !isFinite(increment) || increment <= 0) {
      throw new InvalidCashierInputError('El incremento de redondeo en efectivo debe ser un número positivo.');
    }
    this.increment = increment;
    this.mode = mode;
  }

  public static fromConfig(config: CashRoundingPolicy | CashRoundingConfig): CashRoundingPolicy {
    if (config instanceof CashRoundingPolicy) return config;
    return new CashRoundingPolicy(config.increment, config.mode ?? 'HALF_UP');
  }

  public round(amount: Money): CashRoundingResult {
    const factor = Math.pow(10, amount.decimals);
    const stepCents = Math.round(this.increment * factor);
    if (stepCents <= 0) {
      throw new InvalidCashierInputError(
        `El incremento de redondeo (${this.increment}) es demasiado pequeño para la moneda ${amount.currency}.`
      );
    }

    const totalCents = amount.toCents();
    const remainder = totalCents % stepCents;

    if (remainder === 0) {
      return {
        original: amount,
        rounded: amount,
        adjustment: Money.zero(amount.currency),
      };
    }

    let roundedCents: number;
    if (this.mode === 'DOWN') {
      roundedCents = totalCents - remainder;
    } else if (this.mode === 'UP') {
      roundedCents = totalCents + (stepCents - remainder);
    } else {
      // HALF_UP
      roundedCents = remainder * 2 >= stepCents
        ? totalCents + (stepCents - remainder)
        : totalCents - remainder;
    }

    const rounded = Money.fromCents(roundedCents, amount.currency);
    const adjustment = rounded.subtract(amount);
    return {
      original: amount,
      rounded,
      adjustment,
    };
  }
}
