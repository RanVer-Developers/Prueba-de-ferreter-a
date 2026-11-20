import { describe, expect, it } from 'vitest';
import { CashBreakdown, Money } from '../src/index.js';

describe('Optimal Coin Change Algorithm (Stock Limitado)', () => {
  it('debe calcular el cambio óptimo minimizando piezas con stock limitado', () => {
    // Gaveta contiene:
    // 2 billetes de $100 ($200)
    // 3 billetes de $50  ($150)
    // 4 billetes de $20  ($80)
    // 2 billetes de $10  ($20)
    // 5 monedas de $1    ($5)
    const drawer = new CashBreakdown({
      100: 2,
      50: 3,
      20: 4,
      10: 2,
      1: 5,
    }, 'USD');

    // Queremos dar vuelto de $235
    // Solución esperada óptima: 2x $100 ($200) + 1x $20 ($20) + 1x $10 ($10) + 5x $1 ($5) = $235
    const result = drawer.calculateOptimalChange(Money.fromDecimal(235, 'USD'));

    expect(result.possible).toBe(true);
    expect(result.remainingToDispense.toDecimal()).toBe(0);
    expect(result.changeBreakdown.calculateTotal().toDecimal()).toBe(235);
    expect(result.changeBreakdown.getCount(100)).toBe(2);
    expect(result.changeBreakdown.getCount(20)).toBe(1);
    expect(result.changeBreakdown.getCount(10)).toBe(1);
    expect(result.changeBreakdown.getCount(1)).toBe(5);
  });

  it('debe retroceder (backtracking) si el enfoque greedy se queda sin cambio chico', () => {
    // Escenario clásico de backtracking:
    // Necesitamos dar $60 de cambio.
    // Gaveta solo tiene: 1 billete de $50 y 3 billetes de $20. (Total $110)
    // Enfoque Greedy puro tomaría $50 y luego fallaría porque no hay $10.
    // El algoritmo óptimo con backtracking debe descartar el $50 y tomar 3x $20 = $60.
    const drawer = new CashBreakdown({
      50: 1,
      20: 3,
    }, 'USD');

    const result = drawer.calculateOptimalChange(Money.fromDecimal(60, 'USD'));

    expect(result.possible).toBe(true);
    expect(result.changeBreakdown.getCount(20)).toBe(3);
    expect(result.changeBreakdown.getCount(50)).toBe(0);
    expect(result.changeBreakdown.calculateTotal().toDecimal()).toBe(60);
  });

  it('debe reportar possible: false si la gaveta no tiene las denominaciones necesarias aunque tenga dinero total', () => {
    // Gaveta tiene $100 (un solo billete de $100).
    // Necesitamos dar $15 de vuelto.
    const drawer = new CashBreakdown({
      100: 1,
    }, 'USD');

    const result = drawer.calculateOptimalChange(Money.fromDecimal(15, 'USD'));

    expect(result.possible).toBe(false);
    expect(result.remainingToDispense.toDecimal()).toBe(15);
  });

  it('debe permitir sumar y restar stock de gaveta correctamente', () => {
    const initial = new CashBreakdown({ 50: 2, 20: 5 }, 'USD'); // $200
    const received = new CashBreakdown({ 100: 1, 10: 2 }, 'USD'); // $120

    const merged = initial.add(received);
    expect(merged.calculateTotal().toDecimal()).toBe(320);
    expect(merged.getCount(100)).toBe(1);
    expect(merged.getCount(50)).toBe(2);

    const changeDispensed = new CashBreakdown({ 50: 1, 20: 2 }, 'USD'); // $90
    const afterChange = merged.subtract(changeDispensed);
    expect(afterChange.calculateTotal().toDecimal()).toBe(230);
    expect(afterChange.getCount(50)).toBe(1);
    expect(afterChange.getCount(20)).toBe(3);
  });
});
