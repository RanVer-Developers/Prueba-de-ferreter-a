import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../src/domain/errors/cashier-errors.js';
import { Money } from '../src/domain/value-objects/money.js';

describe('Money Value Object', () => {
  it('debe crear montos a partir de decimales de forma exacta sin errores de punto flotante', () => {
    const m1 = Money.fromDecimal(0.1, 'USD');
    const m2 = Money.fromDecimal(0.2, 'USD');
    const sum = m1.add(m2);

    expect(sum.toDecimal()).toBe(0.3);
    expect(sum.toCents()).toBe(30);
    expect(sum.toString()).toBe('0.30 USD');
  });

  it('debe manejar sumas, restas y multiplicaciones correctamente', () => {
    const a = Money.fromDecimal(10.50, 'USD');
    const b = Money.fromDecimal(4.25, 'USD');

    expect(a.add(b).toDecimal()).toBe(14.75);
    expect(a.subtract(b).toDecimal()).toBe(6.25);
    expect(a.multiply(2).toDecimal()).toBe(21.00);
    expect(a.multiply(0.5).toDecimal()).toBe(5.25);
  });

  it('debe comparar montos adecuadamente', () => {
    const low = Money.fromDecimal(50, 'USD');
    const high = Money.fromDecimal(100, 'USD');
    const equal = Money.fromDecimal(50, 'USD');

    expect(low.equals(equal)).toBe(true);
    expect(high.greaterThan(low)).toBe(true);
    expect(low.lessThan(high)).toBe(true);
    expect(low.greaterThanOrEqual(equal)).toBe(true);
    expect(low.lessThanOrEqual(high)).toBe(true);
    expect(high.isPositive()).toBe(true);
    expect(Money.zero('USD').isZero()).toBe(true);
    expect(Money.fromDecimal(-10, 'USD').isNegative()).toBe(true);
  });

  it('debe lanzar CurrencyMismatchError si se operan monedas distintas', () => {
    const usd = Money.fromDecimal(100, 'USD');
    const eur = Money.fromDecimal(100, 'EUR');

    expect(() => usd.add(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd.subtract(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd.greaterThan(eur)).toThrow(CurrencyMismatchError);
  });

  it('debe rechazar valores numéricos no finitos o inválidos', () => {
    expect(() => Money.fromDecimal(NaN)).toThrow(InvalidMoneyAmountError);
    expect(() => Money.fromDecimal(Infinity)).toThrow(InvalidMoneyAmountError);
  });
});
