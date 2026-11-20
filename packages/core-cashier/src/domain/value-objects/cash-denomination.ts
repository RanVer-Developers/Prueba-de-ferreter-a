import {
  CurrencyMismatchError,
  InvalidDenominationQuantityError,
  InvalidMoneyAmountError,
} from '../errors/cashier-errors.js';
import { Money } from './money.js';

export interface DenominationItem {
  readonly denomination: number; // Ej: 100, 50, 20, 10, 5, 1, 0.50, 0.25, 0.10, etc.
  readonly count: number;        // Cantidad física contada
  readonly subtotal: Money;      // denomination * count
}

export interface CashBreakdownJSON {
  items: Array<{
    denomination: number;
    count: number;
    subtotal: number;
  }>;
  total: number;
  currency: string;
}

export interface OptimalChangeResult {
  readonly possible: boolean;
  readonly changeBreakdown: CashBreakdown;
  readonly remainingToDispense: Money;
}

/**
 * Representa el desglose físico detallado de billetes y monedas en gaveta.
 * Maneja inventario físico de denominaciones y resolución de cambio óptimo (Coin Change con stock limitado).
 */
export class CashBreakdown {
  private readonly _items: Map<number, number>;
  public readonly currency: string;

  public constructor(counts: Record<number, number> = {}, currency = 'USD') {
    this._items = new Map();
    this.currency = currency.toUpperCase().trim();

    for (const [denomStr, count] of Object.entries(counts)) {
      const denom = parseFloat(denomStr);
      if (isNaN(denom) || denom <= 0) {
        throw new InvalidMoneyAmountError(denom, 'La denominación debe ser un número positivo.');
      }
      if (!Number.isInteger(count) || count < 0) {
        throw new InvalidDenominationQuantityError(denom, count);
      }
      if (count > 0) {
        this._items.set(denom, count);
      }
    }
  }

  public static empty(currency = 'USD'): CashBreakdown {
    return new CashBreakdown({}, currency);
  }

  public getCount(denomination: number): number {
    return this._items.get(denomination) || 0;
  }

  public getItems(): DenominationItem[] {
    const sortedDenoms = Array.from(this._items.keys()).sort((a, b) => b - a);

    return sortedDenoms.map((denom) => {
      const count = this._items.get(denom) || 0;
      const subtotal = Money.fromDecimal(denom, this.currency).multiply(count);
      return {
        denomination: denom,
        count,
        subtotal,
      };
    });
  }

  public calculateTotal(): Money {
    let total = Money.zero(this.currency);
    for (const [denom, count] of this._items.entries()) {
      const itemSubtotal = Money.fromDecimal(denom, this.currency).multiply(count);
      total = total.add(itemSubtotal);
    }
    return total;
  }

  /**
   * Suma el stock de otro desglose físico a este (ej. al recibir efectivo o fondo de caja).
   */
  public add(other: CashBreakdown): CashBreakdown {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }

    const merged: Record<number, number> = {};
    for (const [denom, count] of this._items.entries()) {
      merged[denom] = count;
    }
    for (const [denom, count] of other._items.entries()) {
      merged[denom] = (merged[denom] || 0) + count;
    }

    return new CashBreakdown(merged, this.currency);
  }

  /**
   * Resta el stock de otro desglose físico (ej. al entregar cambio o realizar un retiro parcial).
   */
  public subtract(other: CashBreakdown): CashBreakdown {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }

    const result: Record<number, number> = {};
    for (const [denom, count] of this._items.entries()) {
      result[denom] = count;
    }

    for (const [denom, countToSubtract] of other._items.entries()) {
      const current = result[denom] || 0;
      if (current < countToSubtract) {
        throw new InvalidDenominationQuantityError(
          denom,
          current - countToSubtract
        );
      }
      const remaining = current - countToSubtract;
      if (remaining > 0) {
        result[denom] = remaining;
      } else {
        delete result[denom];
      }
    }

    return new CashBreakdown(result, this.currency);
  }

  /**
   * Determina si la gaveta tiene cantidades suficientes de denominaciones para cubrir otro desglose.
   */
  public hasSufficientDenominations(other: CashBreakdown): boolean {
    for (const [denom, requiredCount] of other._items.entries()) {
      const available = this.getCount(denom);
      if (available < requiredCount) {
        return false;
      }
    }
    return true;
  }

  /**
   * Algoritmo de Cambio Óptimo (Bounded Coin Change / Búsqueda con Backtracking).
   * Calcula la combinación exacta de billetes y monedas para devolver el cambio requerido
   * utilizando únicamente las existencias físicas disponibles en gaveta y minimizando
   * la cantidad de unidades entregadas.
   */
  public calculateOptimalChange(changeAmount: Money): OptimalChangeResult {
    if (this.currency !== changeAmount.currency) {
      throw new CurrencyMismatchError(this.currency, changeAmount.currency);
    }

    if (changeAmount.isZero()) {
      return {
        possible: true,
        changeBreakdown: CashBreakdown.empty(this.currency),
        remainingToDispense: Money.zero(this.currency),
      };
    }

    if (changeAmount.isNegative()) {
      return {
        possible: false,
        changeBreakdown: CashBreakdown.empty(this.currency),
        remainingToDispense: changeAmount,
      };
    }

    const targetCents = changeAmount.toCents();
    const availableTotalCents = this.calculateTotal().toCents();

    if (targetCents > availableTotalCents) {
      return {
        possible: false,
        changeBreakdown: CashBreakdown.empty(this.currency),
        remainingToDispense: changeAmount,
      };
    }

    // Convertir denominaciones disponibles a unidades menores (según decimales de la moneda) y ordenarlas descendente
    const unitFactor = Math.pow(10, changeAmount.decimals);
    const denomsInCents = Array.from(this._items.keys())
      .map((d) => ({
        original: d,
        cents: Math.round(Number((d * unitFactor).toPrecision(15))),
        count: this._items.get(d)!,
      }))
      .filter((d) => d.count > 0 && d.cents <= targetCents)
      .sort((a, b) => b.cents - a.cents);

    let bestSolution: Map<number, number> | null = null;
    let minUnits = Infinity;

    // DFS con backtracking para encontrar la solución con menor número de piezas
    const solve = (index: number, remainingCents: number, currentSolution: Map<number, number>, currentUnits: number) => {
      if (remainingCents === 0) {
        if (currentUnits < minUnits) {
          minUnits = currentUnits;
          bestSolution = new Map(currentSolution);
        }
        return;
      }

      if (index >= denomsInCents.length || currentUnits >= minUnits) {
        return;
      }

      const item = denomsInCents[index];
      const maxPossible = Math.min(item.count, Math.floor(remainingCents / item.cents));

      for (let count = maxPossible; count >= 0; count--) {
        if (count > 0) {
          currentSolution.set(item.original, count);
        } else {
          currentSolution.delete(item.original);
        }

        solve(index + 1, remainingCents - count * item.cents, currentSolution, currentUnits + count);
      }

      currentSolution.delete(item.original);
    };

    solve(0, targetCents, new Map<number, number>(), 0);

    if (bestSolution) {
      const countsRecord: Record<number, number> = {};
      for (const [denom, count] of (bestSolution as Map<number, number>).entries()) {
        countsRecord[denom] = count;
      }
      const changeBreakdown = new CashBreakdown(countsRecord, this.currency);
      return {
        possible: true,
        changeBreakdown,
        remainingToDispense: Money.zero(this.currency),
      };
    }

    return {
      possible: false,
      changeBreakdown: CashBreakdown.empty(this.currency),
      remainingToDispense: changeAmount,
    };
  }

  /**
   * Reconstruye un desglose desde su JSON ({ items: [{ denomination, count }], currency }).
   */
  public static fromJSON(json: Pick<CashBreakdownJSON, 'currency'> & { items: Array<{ denomination: number; count: number }> }): CashBreakdown {
    const counts: Record<number, number> = {};
    for (const item of json.items) {
      counts[item.denomination] = (counts[item.denomination] || 0) + item.count;
    }
    return new CashBreakdown(counts, json.currency);
  }

  public toJSON(): CashBreakdownJSON {
    const items = this.getItems().map((item) => ({
      denomination: item.denomination,
      count: item.count,
      subtotal: item.subtotal.toDecimal(),
    }));

    return {
      items,
      total: this.calculateTotal().toDecimal(),
      currency: this.currency,
    };
  }
}
