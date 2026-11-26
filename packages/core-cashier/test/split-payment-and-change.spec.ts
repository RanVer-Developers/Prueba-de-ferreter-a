import { beforeEach, describe, expect, it } from 'vitest';
import {
  CashRegister,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InsufficientChangeDenominationsError,
  OpenShiftUseCase,
  PaymentMethod,
  RecordPaymentUseCase,
} from '../src/index.js';

describe('Split Payment & Vuelto Automático', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  const cashier = { id: 'usr-1', name: 'Laura Gómez' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();

    const register = new CashRegister({
      id: 'reg-01',
      name: 'Caja Mostrador',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  it('debe derivar automáticamente el efectivo requerido y el vuelto en compras mixtas sin cálculo previo en frontend', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    // Turno abre con $1,000 en caja
    await openUseCase.execute({
      shiftId: 'shift-split-1',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 1000,
    });

    // Escenario del usuario:
    // Ticket de $300.
    // Cliente paga $200 con Tarjeta y entrega un billete de $500 en efectivo.
    // Efectivo requerido derivado: $300 - $200 = $100.
    // Vuelto derivado: $500 - $100 = $400.
    const result = await paymentUseCase.execute({
      shiftId: 'shift-split-1',
      transactionReference: 'TICKET-9901',
      ticketTotal: 300,
      payments: [
        { id: 'pay-card', method: PaymentMethod.CREDIT_CARD, amount: 200, reference: 'AUTH-1234' },
      ],
      tenderedCash: 500,
      performedBy: cashier,
    });

    expect(result.ticketTotal.toDecimal()).toBe(300);
    expect(result.totalPaid.toDecimal()).toBe(300);
    expect(result.cashRequired.toDecimal()).toBe(100);
    expect(result.changeGiven.toDecimal()).toBe(400);

    // Movimientos generados: 1 por tarjeta ($200) y 1 por efectivo neto de la venta ($100)
    expect(result.movements.length).toBe(2);
    const cardMov = result.movements.find((m) => m.paymentMethod === PaymentMethod.CREDIT_CARD);
    const cashMov = result.movements.find((m) => m.paymentMethod === PaymentMethod.CASH);

    expect(cardMov?.amount.toDecimal()).toBe(200);
    expect(cashMov?.amount.toDecimal()).toBe(100);

    // Efectivo en gaveta: 1000 (inicio) + 100 (ingreso neto) = 1100
    const shift = await shiftRepo.findById('shift-split-1');
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(1100);
  });

  it('debe validar denominaciones físicas disponibles si se activa requireExactDenominations', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    // Turno abre con solo 2 billetes de $100 (Total $200)
    await openUseCase.execute({
      shiftId: 'shift-split-2',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 200,
      cashBreakdownCounts: {
        100: 2,
      },
    });

    // Venta de $20 en efectivo. Cliente entrega un billete de $50 (cambio requerido: $30).
    // La caja tiene $200, pero solo en billetes de $100, no puede dar $30 de cambio.
    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-split-2',
        transactionReference: 'TICKET-9902',
        ticketTotal: 20,
        payments: [{ id: 'p-cash', method: PaymentMethod.CASH }],
        tenderedCash: 50,
        requireExactDenominations: true,
        performedBy: cashier,
      })
    ).rejects.toThrow(InsufficientChangeDenominationsError);
  });

  it('debe entregar vuelto exitosamente y actualizar inventario de gaveta si hay cambio disponible', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    // Turno abre con: 2x $100, 5x $20, 10x $10
    await openUseCase.execute({
      shiftId: 'shift-split-3',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 400,
      cashBreakdownCounts: {
        100: 2,
        20: 5,
        10: 10,
      },
    });

    // Venta de $70 en efectivo. Cliente entrega un billete de $100 (cambio: $30).
    const result = await paymentUseCase.execute({
      shiftId: 'shift-split-3',
      transactionReference: 'TICKET-9903',
      ticketTotal: 70,
      payments: [{ id: 'p-cash', method: PaymentMethod.CASH }],
      tenderedCash: 100,
      tenderedBreakdownCounts: { 100: 1 },
      requireExactDenominations: true,
      performedBy: cashier,
    });

    expect(result.changeGiven.toDecimal()).toBe(30);
    expect(result.optimalChangeBreakdown).toBeDefined();
    // Cambio óptimo de $30: 1x $20 + 1x $10
    expect(result.optimalChangeBreakdown?.getCount(20)).toBe(1);
    expect(result.optimalChangeBreakdown?.getCount(10)).toBe(1);

    // Gaveta actualizada:
    // Billetes de 100: 2 iniciales + 1 recibido = 3
    // Billetes de 20: 5 iniciales - 1 devuelto = 4
    // Billetes de 10: 10 iniciales - 1 devuelto = 9
    const shift = await shiftRepo.findById('shift-split-3');
    expect(shift?.drawerBreakdown.getCount(100)).toBe(3);
    expect(shift?.drawerBreakdown.getCount(20)).toBe(4);
    expect(shift?.drawerBreakdown.getCount(10)).toBe(9);
  });
});
