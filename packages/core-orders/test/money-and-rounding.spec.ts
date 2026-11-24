import { describe, expect, it } from 'vitest';
import {
  apportionByWeights,
  CurrencyMismatchError,
  divideHalfEven,
  InvalidMoneyAmountError,
  Money,
  multiplyCentsHalfEven,
  roundHalfEven,
} from '../src/index.js';

describe('Money & ROUND_HALF_EVEN arithmetic', () => {
  it('applies banker rounding (ROUND_HALF_EVEN) on ties', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
    expect(roundHalfEven(2.49)).toBe(2);
    expect(roundHalfEven(2.51)).toBe(3);
  });

  it('performs exact BigInt divideHalfEven and multiplyCentsHalfEven without float drift', () => {
    expect(divideHalfEven(25n, 10n)).toBe(2);
    expect(divideHalfEven(35n, 10n)).toBe(4);
    expect(divideHalfEven(-25n, 10n)).toBe(-2);
    expect(multiplyCentsHalfEven(100, 0.025)).toBe(2);
    expect(multiplyCentsHalfEven(100, 0.035)).toBe(4);
    expect(multiplyCentsHalfEven(1999, 1.16)).toBe(2319);
  });

  it('apportions totals by weights using Hamilton largest remainder', () => {
    expect(apportionByWeights(100, [100, 100, 100])).toEqual([34, 33, 33]);
    expect(apportionByWeights(10, [1, 2, 3])).toEqual([2, 3, 5]);
    expect(apportionByWeights(0, [10, 20])).toEqual([0, 0]);
    expect(apportionByWeights(50, [0, 0])).toEqual([0, 0]);
  });

  it('handles ISO 4217 currencies and prevents cross-currency operations', () => {
    const jpy = Money.fromDecimal(1500, 'JPY');
    expect(jpy.decimals).toBe(0);
    expect(jpy.toCents()).toBe(1500);

    const kwd = Money.fromDecimal(1.235, 'KWD');
    expect(kwd.decimals).toBe(3);
    expect(kwd.toCents()).toBe(1235);

    const usd = Money.fromDecimal(10.5, 'usd');
    expect(usd.currency).toBe('USD');
    expect(usd.toCents()).toBe(1050);

    expect(() => usd.add(jpy)).toThrow(CurrencyMismatchError);
    expect(() => Money.fromCents(12.5, 'USD')).toThrow(InvalidMoneyAmountError);
    expect(() => Money.fromCents(100, 'XX')).toThrow(InvalidMoneyAmountError);
  });

  it('supports homologated Money ratio/micro math, allocation, comparisons, format, and JSON', () => {
    const base = Money.fromCents(10000, 'MXN');
    expect(base.multiplyRatio(3, 2).toCents()).toBe(15000);
    expect(base.multiplyMicro(160_000).toCents()).toBe(1600);
    expect(base.allocateByWeights([1, 1, 1]).map((m) => m.toCents())).toEqual([3334, 3333, 3333]);
    expect(base.greaterThanOrEqual(base)).toBe(true);
    expect(base.lessThanOrEqual(base)).toBe(true);
    expect(base.format('es-MX')).toContain('100');

    const restored = Money.fromJSON(base.toJSON());
    expect(restored.equals(base)).toBe(true);
  });
});
