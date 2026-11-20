import { describe, expect, it } from 'vitest';
import {
  CashierLockedError,
  CashMovement,
  CashShift,
  InsufficientCashInDrawerError,
  InvalidShiftStatusError,
  Money,
  MovementType,
  PaymentMethod,
  ShiftStatus,
} from '../src/index.js';

describe('CashShift Aggregate', () => {
  const cashier = { id: 'usr-1', name: 'Carlos Cajero' };

  it('debe inicializar un turno con su saldo de apertura', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(150, 'USD'),
    });

    expect(shift.isOpen()).toBe(true);
    expect(shift.status).toBe(ShiftStatus.OPEN);
    expect(shift.calculateExpectedCash().toDecimal()).toBe(150);
  });

  it('debe registrar ventas en efectivo e incrementar el saldo esperado', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(100, 'USD'),
    });

    const sale = new CashMovement({
      id: 'mov-1',
      shiftId: shift.id,
      type: MovementType.SALE,
      amount: Money.fromDecimal(45.50, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Venta #1001',
      performedBy: cashier,
    });

    shift.recordMovement(sale);

    expect(shift.movements.length).toBe(1);
    expect(shift.calculateExpectedCash().toDecimal()).toBe(145.50);
  });

  it('no debe incrementar el saldo de efectivo si el pago es con tarjeta', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(100, 'USD'),
    });

    const cardSale = new CashMovement({
      id: 'mov-1',
      shiftId: shift.id,
      type: MovementType.SALE,
      amount: Money.fromDecimal(200, 'USD'),
      paymentMethod: PaymentMethod.CREDIT_CARD,
      concept: 'Venta #1002 con tarjeta',
      performedBy: cashier,
    });

    shift.recordMovement(cardSale);

    // El efectivo en gaveta sigue siendo 100
    expect(shift.calculateExpectedCash().toDecimal()).toBe(100);

    const summary = shift.calculateSummary();
    expect(summary.totalSales.toDecimal()).toBe(200);
    expect(summary.totalsByMethod[PaymentMethod.CREDIT_CARD].in.toDecimal()).toBe(200);
  });

  it('debe rechazar salidas en efectivo mayores al saldo disponible en gaveta', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(50, 'USD'),
    });

    const withdrawal = new CashMovement({
      id: 'mov-1',
      shiftId: shift.id,
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: Money.fromDecimal(60, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Pago a mensajería',
      performedBy: cashier,
    });

    expect(() => shift.recordMovement(withdrawal)).toThrow(InsufficientCashInDrawerError);
  });

  it('debe permitir retiro si se habilita el flag allowNegativeCash', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(50, 'USD'),
    });

    const withdrawal = new CashMovement({
      id: 'mov-1',
      shiftId: shift.id,
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: Money.fromDecimal(60, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Pago urgente autorizado',
      performedBy: cashier,
    });

    shift.recordMovement(withdrawal, true);
    expect(shift.calculateExpectedCash().toDecimal()).toBe(-10);
  });

  it('no debe permitir movimientos en turnos suspendidos o cerrados', () => {
    const shift = new CashShift({
      id: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(50, 'USD'),
    });

    shift.suspend();
    expect(shift.status).toBe(ShiftStatus.SUSPENDED);

    const sale = new CashMovement({
      id: 'mov-1',
      shiftId: shift.id,
      type: MovementType.SALE,
      amount: Money.fromDecimal(10, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Venta',
      performedBy: cashier,
    });

    expect(() => shift.recordMovement(sale)).toThrow(CashierLockedError);

    shift.resume();
    expect(shift.status).toBe(ShiftStatus.OPEN);
    expect(() => shift.recordMovement(sale)).not.toThrow();
  });
});
