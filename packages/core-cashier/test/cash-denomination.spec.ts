import { describe, expect, it } from 'vitest';
import { InvalidDenominationQuantityError } from '../src/domain/errors/cashier-errors.js';
import { CashBreakdown } from '../src/domain/value-objects/cash-denomination.js';

describe('CashBreakdown Value Object', () => {
  it('debe calcular la suma total a partir de billetes y monedas', () => {
    // 2 billetes de 100, 3 de 50, 5 de 20, 10 monedas de 1, 4 monedas de 0.25
    const breakdown = new CashBreakdown({
      100: 2,  // 200
      50: 3,   // 150
      20: 5,   // 100
      1: 10,   // 10
      0.25: 4, // 1
    }, 'USD');

    const total = breakdown.calculateTotal();
    expect(total.toDecimal()).toBe(461.00);
    expect(breakdown.getCount(100)).toBe(2);
    expect(breakdown.getCount(50)).toBe(3);
    expect(breakdown.getCount(5)).toBe(0);
  });

  it('debe ordenar los ítems de mayor a menor denominación', () => {
    const breakdown = new CashBreakdown({
      10: 2,
      100: 1,
      0.5: 4,
      50: 3,
    }, 'USD');

    const items = breakdown.getItems();
    expect(items.map((i) => i.denomination)).toEqual([100, 50, 10, 0.5]);
    expect(items[0].subtotal.toDecimal()).toBe(100);
    expect(items[1].subtotal.toDecimal()).toBe(150);
  });

  it('debe fallar si las cantidades no son enteros no negativos', () => {
    expect(() => new CashBreakdown({ 20: -1 })).toThrow(InvalidDenominationQuantityError);
    expect(() => new CashBreakdown({ 20: 1.5 })).toThrow(InvalidDenominationQuantityError);
  });
});
