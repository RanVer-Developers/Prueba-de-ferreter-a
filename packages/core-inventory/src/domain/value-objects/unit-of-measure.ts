import { UnitOfMeasureMismatchError } from '../errors/inventory-errors.js';

export type UOMCategory = 'DISCRETE' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'CUSTOM';

export interface UnitOfMeasureProps {
  code: string;
  name: string;
  category: UOMCategory;
  precision?: number; // Cantidad de decimales permitidos (0 para discretas, 3 o 4 para peso/volumen)
  baseUnitCode?: string;
  conversionFactorToBase?: number;
}

export interface UnitOfMeasureJSON {
  code: string;
  name: string;
  category: UOMCategory;
  precision: number;
  baseUnitCode?: string;
  conversionFactorToBase?: number;
}

/**
 * Value Object para Unidades de Medida (UOM) y sus reglas de conversión estándar.
 */
export class UnitOfMeasure {
  public readonly code: string;
  public readonly name: string;
  public readonly category: UOMCategory;
  public readonly precision: number;
  public readonly baseUnitCode?: string;
  public readonly conversionFactorToBase?: number;

  constructor(props: UnitOfMeasureProps) {
    this.code = props.code.toUpperCase().trim();
    this.name = props.name;
    this.category = props.category;
    this.precision = props.precision ?? (props.category === 'DISCRETE' ? 0 : 3);
    this.baseUnitCode = props.baseUnitCode ? props.baseUnitCode.toUpperCase().trim() : undefined;
    this.conversionFactorToBase = props.conversionFactorToBase;
  }

  public static UNIT = new UnitOfMeasure({
    code: 'UNIT',
    name: 'Unidad',
    category: 'DISCRETE',
    precision: 0,
    baseUnitCode: 'UNIT',
    conversionFactorToBase: 1,
  });
  public static PIECE = new UnitOfMeasure({
    code: 'PCE',
    name: 'Pieza',
    category: 'DISCRETE',
    precision: 0,
    baseUnitCode: 'UNIT',
    conversionFactorToBase: 1,
  });
  public static BOX = new UnitOfMeasure({ code: 'BOX', name: 'Caja', category: 'DISCRETE', precision: 0 });
  public static DOZEN = new UnitOfMeasure({
    code: 'DZN',
    name: 'Docena',
    category: 'DISCRETE',
    precision: 0,
    baseUnitCode: 'UNIT',
    conversionFactorToBase: 12,
  });

  // Peso (base: Gramos)
  public static GRAM = new UnitOfMeasure({
    code: 'G',
    name: 'Gramo',
    category: 'WEIGHT',
    precision: 2,
    baseUnitCode: 'G',
    conversionFactorToBase: 1,
  });
  public static KILOGRAM = new UnitOfMeasure({
    code: 'KG',
    name: 'Kilogramo',
    category: 'WEIGHT',
    precision: 3,
    baseUnitCode: 'G',
    conversionFactorToBase: 1000,
  });
  public static MILLIGRAM = new UnitOfMeasure({
    code: 'MG',
    name: 'Miligramo',
    category: 'WEIGHT',
    precision: 2,
    baseUnitCode: 'G',
    conversionFactorToBase: 0.001,
  });

  // Volumen (base: Mililitros)
  public static MILLILITER = new UnitOfMeasure({
    code: 'ML',
    name: 'Mililitro',
    category: 'VOLUME',
    precision: 2,
    baseUnitCode: 'ML',
    conversionFactorToBase: 1,
  });
  public static LITER = new UnitOfMeasure({
    code: 'L',
    name: 'Litro',
    category: 'VOLUME',
    precision: 3,
    baseUnitCode: 'ML',
    conversionFactorToBase: 1000,
  });

  // Longitud (base: Milímetros)
  public static METER = new UnitOfMeasure({
    code: 'M',
    name: 'Metro',
    category: 'LENGTH',
    precision: 3,
    baseUnitCode: 'MM',
    conversionFactorToBase: 1000,
  });
  public static CENTIMETER = new UnitOfMeasure({
    code: 'CM',
    name: 'Centímetro',
    category: 'LENGTH',
    precision: 2,
    baseUnitCode: 'MM',
    conversionFactorToBase: 10,
  });
  public static MILLIMETER = new UnitOfMeasure({
    code: 'MM',
    name: 'Milímetro',
    category: 'LENGTH',
    precision: 1,
    baseUnitCode: 'MM',
    conversionFactorToBase: 1,
  });

  /**
   * Determina si dos unidades son directamente compatibles para conversión.
   */
  public isCompatibleWith(target: UnitOfMeasure): boolean {
    if (this.code === target.code) return true;
    if (this.category !== target.category) return false;
    return !!(this.baseUnitCode && target.baseUnitCode && this.baseUnitCode === target.baseUnitCode);
  }

  /**
   * Convierte un valor numérico desde esta unidad hacia la unidad destino.
   */
  public convertValueTo(value: number, target: UnitOfMeasure): number {
    if (this.code === target.code) return value;
    if (!this.isCompatibleWith(target)) {
      throw new UnitOfMeasureMismatchError(this.code, target.code);
    }
    const valInBase = value * (this.conversionFactorToBase ?? 1);
    const converted = valInBase / (target.conversionFactorToBase ?? 1);
    return Number(converted.toFixed(target.precision));
  }

  public toJSON(): UnitOfMeasureJSON {
    return {
      code: this.code,
      name: this.name,
      category: this.category,
      precision: this.precision,
      baseUnitCode: this.baseUnitCode,
      conversionFactorToBase: this.conversionFactorToBase,
    };
  }

  public static fromJSON(json: UnitOfMeasureJSON): UnitOfMeasure {
    return new UnitOfMeasure(json);
  }
}
