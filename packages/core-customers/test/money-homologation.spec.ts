import { describe, expect, it } from 'vitest';
import { InvalidMoneyAmountError, Money } from '../src/index.js';

describe('core-customers Money homologation', () => {
  it('supports shared Money API: multiply, ratio, micro, allocate, comparisons, format, and JSON', () => {
    const m = Money.fromDecimal(100, 'MXN');
    expect(m.toCents()).toBe(10000);
    expect(m.multiply(1.5).toCents()).toBe(15000);
    expect(m.multiplyRatio(1, 3).toCents()).toBe(3333);
    expect(m.multiplyMicro(160_000).toCents()).toBe(1600);
    expect(m.allocateByWeights([1, 1, 1]).map((x) => x.toCents())).toEqual([3334, 3333, 3333]);

    const smaller = Money.fromCents(5000, 'MXN');
    expect(m.greaterThan(smaller)).toBe(true);
    expect(m.greaterThanOrEqual(m)).toBe(true);
    expect(smaller.lessThan(m)).toBe(true);
    expect(smaller.lessThanOrEqual(smaller)).toBe(true);
    expect(m.format('es-MX')).toContain('100');

    const json = m.toJSON();
    const restored = Money.fromJSON(json);
    expect(restored.equals(m)).toBe(true);
    expect(m.toString()).toBe('100.00 MXN');

    expect(() => Money.fromCents(12.5, 'MXN')).toThrow(InvalidMoneyAmountError);
  });
});
