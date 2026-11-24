import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  InvalidMoneyAmountError,
  InvalidQuantityError,
  Money,
  Quantity,
  UnitOfMeasure,
  UnitOfMeasureMismatchError,
} from '../src/index.js';

describe('Money Value Object', () => {
  it('debe manejar aritmética exacta en centavos y decimales según ISO 4217', () => {
    const usd1 = Money.fromDecimal(19.99, 'USD');
    const usd2 = Money.fromDecimal(10.01, 'USD');
    const total = usd1.add(usd2);

    expect(total.toCents()).toBe(3000);
    expect(total.toDecimal()).toBe(30.0);
    expect(total.toString()).toBe('30.00 USD');
  });

  it('debe manejar monedas sin decimales (ej: JPY)', () => {
    const jpy = Money.fromDecimal(500, 'JPY');
    expect(jpy.decimals).toBe(0);
    expect(jpy.toCents()).toBe(500);
    expect(jpy.toDecimal()).toBe(500);
    expect(jpy.toString()).toBe('500 JPY');
  });

  it('debe manejar monedas con 3 decimales (ej: KWD)', () => {
    const kwd = Money.fromDecimal(1.5, 'KWD');
    expect(kwd.decimals).toBe(3);
    expect(kwd.toCents()).toBe(1500);
    expect(kwd.toDecimal()).toBe(1.5);
    expect(kwd.toString()).toBe('1.500 KWD');
  });

  it('debe lanzar CurrencyMismatchError si se operan monedas distintas', () => {
    const usd = Money.fromDecimal(10, 'USD');
    const eur = Money.fromDecimal(10, 'EUR');
    expect(() => usd.add(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd.subtract(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd.greaterThan(eur)).toThrow(CurrencyMismatchError);
  });

  it('debe serializar y deserializar JSON sin pérdida de precisión', () => {
    const original = Money.fromDecimal(45.5, 'USD');
    const json = original.toJSON();
    const restored = Money.fromJSON(json);
    expect(restored.equals(original)).toBe(true);
  });

  it('debe validar números no finitos o enteros inválidos', () => {
    expect(() => Money.fromDecimal(NaN)).toThrow(InvalidMoneyAmountError);
    expect(() => Money.fromDecimal(Infinity)).toThrow(InvalidMoneyAmountError);
  });

  it('debe soportar métodos homologados multiplyRatio, multiplyMicro, allocateByWeights, comparaciones y format', () => {
    const m = Money.fromCents(10000, 'USD');
    expect(m.multiplyRatio(1, 4).toCents()).toBe(2500);
    expect(m.multiplyMicro(160_000).toCents()).toBe(1600);
    expect(m.allocateByWeights([1, 1, 1]).map((p) => p.toCents())).toEqual([3334, 3333, 3333]);
    expect(m.greaterThanOrEqual(m)).toBe(true);
    expect(m.lessThanOrEqual(m)).toBe(true);
    expect(m.format('en-US')).toContain('100');
    expect(() => Money.fromJSON({ amountCents: 1.5, currency: 'USD' })).toThrow(InvalidMoneyAmountError);
  });
});

describe('UnitOfMeasure & Quantity Value Objects', () => {
  it('debe crear cantidades con redondeo exacto según precisión de la unidad', () => {
    const qUnit = Quantity.of(5.49, UnitOfMeasure.UNIT);
    expect(qUnit.value).toBe(5); // UNIT precision is 0

    const qKg = Quantity.of(1.23456, UnitOfMeasure.KILOGRAM);
    expect(qKg.value).toBe(1.235); // KG precision is 3
  });

  it('debe convertir y sumar unidades compatibles (Gramos y Kilogramos)', () => {
    const unKilo = Quantity.of(1, UnitOfMeasure.KILOGRAM); // 1 KG = 1000 G
    const quinientosGramos = Quantity.of(500, UnitOfMeasure.GRAM);

    const totalEnKilos = unKilo.add(quinientosGramos);
    expect(totalEnKilos.uom.code).toBe('KG');
    expect(totalEnKilos.value).toBe(1.5);

    const totalEnGramos = quinientosGramos.add(unKilo);
    expect(totalEnGramos.uom.code).toBe('G');
    expect(totalEnGramos.value).toBe(1500);
  });

  it('debe convertir y restar unidades compatibles (Litros y Mililitros)', () => {
    const dosLitros = Quantity.of(2, UnitOfMeasure.LITER);
    const medioLitro = Quantity.of(500, UnitOfMeasure.MILLILITER);

    const restante = dosLitros.subtract(medioLitro);
    expect(restante.value).toBe(1.5);
    expect(restante.uom.code).toBe('L');
  });

  it('debe convertir docenas a unidades', () => {
    const docena = Quantity.of(2, UnitOfMeasure.DOZEN); // 2 docenas = 24 unidades
    const enUnidades = docena.convertTo(UnitOfMeasure.UNIT);
    expect(enUnidades.value).toBe(24);
    expect(enUnidades.uom.code).toBe('UNIT');
  });

  it('debe rechazar operaciones entre unidades incompatibles (ej: KG y Litros)', () => {
    const peso = Quantity.of(5, UnitOfMeasure.KILOGRAM);
    const volumen = Quantity.of(3, UnitOfMeasure.LITER);
    expect(() => peso.add(volumen)).toThrow(UnitOfMeasureMismatchError);
    expect(() => peso.subtract(volumen)).toThrow(UnitOfMeasureMismatchError);
  });

  it('debe validar multiplicación y comparaciones', () => {
    const q1 = Quantity.of(10, UnitOfMeasure.UNIT);
    const multiplicada = q1.multiply(3);
    expect(multiplicada.value).toBe(30);

    const q2 = Quantity.of(15, UnitOfMeasure.UNIT);
    expect(q1.lessThan(q2)).toBe(true);
    expect(multiplicada.greaterThan(q2)).toBe(true);
  });

  it('debe serializar y deserializar JSON de Quantity', () => {
    const q = Quantity.of(2.75, UnitOfMeasure.KILOGRAM);
    const json = q.toJSON();
    const restored = Quantity.fromJSON(json);
    expect(restored.equals(q)).toBe(true);
  });
});
