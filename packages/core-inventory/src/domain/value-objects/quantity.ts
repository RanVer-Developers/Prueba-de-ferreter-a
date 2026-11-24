import { InvalidQuantityError, UnitOfMeasureMismatchError } from '../errors/inventory-errors.js';
import { UnitOfMeasure, UnitOfMeasureJSON } from './unit-of-measure.js';

export interface QuantityJSON {
  value: number;
  uom: UnitOfMeasureJSON;
}

/**
 * Value Object inmutable para cantidades en inventario con precisión controlada y unidad de medida.
 */
export class Quantity {
  public readonly value: number;
  public readonly uom: UnitOfMeasure;

  constructor(value: number, uom: UnitOfMeasure = UnitOfMeasure.UNIT) {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      throw new InvalidQuantityError(value, 'La cantidad debe ser un número finito válido.');
    }
    this.uom = uom;
    // Redondeo exacto según la precisión de la UOM para evitar desbordes de coma flotante
    this.value = Number(value.toFixed(uom.precision));
  }

  public static of(value: number, uom: UnitOfMeasure = UnitOfMeasure.UNIT): Quantity {
    return new Quantity(value, uom);
  }

  public static zero(uom: UnitOfMeasure = UnitOfMeasure.UNIT): Quantity {
    return new Quantity(0, uom);
  }

  public static fromJSON(json: QuantityJSON): Quantity {
    return new Quantity(json.value, UnitOfMeasure.fromJSON(json.uom));
  }

  public add(other: Quantity): Quantity {
    if (!this.uom.isCompatibleWith(other.uom)) {
      throw new UnitOfMeasureMismatchError(this.uom.code, other.uom.code);
    }
    const convertedValue = other.uom.convertValueTo(other.value, this.uom);
    return new Quantity(this.value + convertedValue, this.uom);
  }

  public subtract(other: Quantity): Quantity {
    if (!this.uom.isCompatibleWith(other.uom)) {
      throw new UnitOfMeasureMismatchError(this.uom.code, other.uom.code);
    }
    const convertedValue = other.uom.convertValueTo(other.value, this.uom);
    return new Quantity(this.value - convertedValue, this.uom);
  }

  public multiply(factor: number): Quantity {
    if (typeof factor !== 'number' || isNaN(factor) || !isFinite(factor)) {
      throw new InvalidQuantityError(factor, 'El factor multiplicador debe ser un número válido.');
    }
    return new Quantity(this.value * factor, this.uom);
  }

  public convertTo(targetUom: UnitOfMeasure): Quantity {
    const converted = this.uom.convertValueTo(this.value, targetUom);
    return new Quantity(converted, targetUom);
  }

  public isZero(): boolean {
    return this.value === 0;
  }

  public isPositive(): boolean {
    return this.value > 0;
  }

  public isNegative(): boolean {
    return this.value < 0;
  }

  public equals(other: Quantity): boolean {
    if (!this.uom.isCompatibleWith(other.uom)) return false;
    const otherInThisUom = other.uom.convertValueTo(other.value, this.uom);
    return this.value === otherInThisUom;
  }

  public greaterThan(other: Quantity): boolean {
    if (!this.uom.isCompatibleWith(other.uom)) {
      throw new UnitOfMeasureMismatchError(this.uom.code, other.uom.code);
    }
    const otherInThisUom = other.uom.convertValueTo(other.value, this.uom);
    return this.value > otherInThisUom;
  }

  public lessThan(other: Quantity): boolean {
    if (!this.uom.isCompatibleWith(other.uom)) {
      throw new UnitOfMeasureMismatchError(this.uom.code, other.uom.code);
    }
    const otherInThisUom = other.uom.convertValueTo(other.value, this.uom);
    return this.value < otherInThisUom;
  }

  public toJSON(): QuantityJSON {
    return {
      value: this.value,
      uom: this.uom.toJSON(),
    };
  }

  public toString(): string {
    return `${this.value} ${this.uom.code}`;
  }
}
