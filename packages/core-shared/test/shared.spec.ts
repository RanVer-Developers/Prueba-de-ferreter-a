import { describe, expect, it } from 'vitest';
import {
  apportionByWeights,
  currencyDecimals,
  CurrencyMismatchError,
  decimalToCentsHalfEven,
  divideHalfEven,
  generateId,
  InvalidMoneyAmountError,
  IsoDateTimeSchema,
  Money,
  multiplyCentsHalfEven,
  roundHalfEven,
  scaleFactorMicro,
} from '../src/index.js';

describe('@modulos/core-shared', () => {
  it('supports ISO 4217 currency decimals and validates 3-letter codes', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('KWD')).toBe(3);
    expect(currencyDecimals('CLF')).toBe(4);

    expect(() => Money.fromCents(100, '')).toThrow(InvalidMoneyAmountError);
    expect(() => Money.fromCents(100, '123')).toThrow(InvalidMoneyAmountError);
    expect(() => Money.fromCents(100, 'US')).toThrow(InvalidMoneyAmountError);
  });

  it('applies ROUND_HALF_EVEN consistently in roundHalfEven, divideHalfEven, and fromDecimal', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
    expect(Object.is(roundHalfEven(-0.5), 0)).toBe(true);

    expect(divideHalfEven(5n, 2n)).toBe(2);
    expect(divideHalfEven(7n, 2n)).toBe(4);

    // 1.005 USD -> 100.5 cents -> ROUND_HALF_EVEN -> 100 cents
    expect(Money.fromDecimal(1.005, 'USD').toCents()).toBe(100);
    // 1.015 USD -> 101.5 cents -> ROUND_HALF_EVEN -> 102 cents
    expect(Money.fromDecimal(1.015, 'USD').toCents()).toBe(102);
    // 2.5 JPY -> ROUND_HALF_EVEN -> 2
    expect(Money.fromDecimal(2.5, 'JPY').toCents()).toBe(2);
  });

  it('guards against Infinity/overflow in scaleFactorMicro and multiplyCentsHalfEven', () => {
    expect(() => scaleFactorMicro(1e308)).toThrow(InvalidMoneyAmountError);
    expect(() => scaleFactorMicro(NaN)).toThrow(InvalidMoneyAmountError);
    expect(() => multiplyCentsHalfEven(100, Infinity)).toThrow(InvalidMoneyAmountError);
    expect(multiplyCentsHalfEven(100, 1.005)).toBe(100);
  });

  it('apportions totals via Hamilton largest remainder without losing cents', () => {
    expect(apportionByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(apportionByWeights(0, [1, 2])).toEqual([0, 0]);
    const parts = Money.fromCents(-100, 'USD').allocateByWeights([1, 1, 1]);
    expect(parts.map((p) => p.toCents())).toEqual([-34, -33, -33]);
  });

  it('enforces currency equality and safe JSON deserialization', () => {
    const usd = Money.fromCents(500, 'USD');
    const mxn = Money.fromCents(500, 'MXN');
    expect(() => usd.add(mxn)).toThrow(CurrencyMismatchError);
    expect(Money.fromJSON({ cents: 250, currency: 'usd' }).toString()).toBe('2.50 USD');
    expect(() => Money.fromJSON({ cents: 12.5, currency: 'USD' })).toThrow(InvalidMoneyAmountError);
    expect(Object.is(Money.fromCents(-0, 'USD').toCents(), 0)).toBe(true);
    expect(decimalToCentsHalfEven(0, 'USD')).toBe(0);
  });

  it('validates ISO datetimes and generates collision-free IDs', () => {
    expect(IsoDateTimeSchema.safeParse('2026-11-20T10:00:00.000Z').success).toBe(true);
    expect(IsoDateTimeSchema.safeParse('not-a-date').success).toBe(false);
    const id1 = generateId('mov');
    const id2 = generateId('mov');
    expect(id1.startsWith('mov-')).toBe(true);
    expect(id1).not.toBe(id2);
  });
});
