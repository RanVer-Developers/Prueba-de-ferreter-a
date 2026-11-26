import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditCountUseCase,
  CashRegister,
  CashRegisterAlreadyOpenError,
  CloseShiftUseCase,
  DiscrepancyStatus,
  GetShiftSummaryUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InsufficientCashInDrawerError,
  InvalidPaymentError,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  RecordRefundUseCase,
  ShiftClosedEvent,
  ShiftOpenedEvent,
  ShiftStatus,
} from '../src/index.js';

describe('Cashier LifeCycle - Use Cases E2E', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  let eventsEmitted: any[];

  const eventPublisher = (event: any) => {
    eventsEmitted.push(event);
  };

  const cashier = { id: 'usr-10', name: 'Ana Cajera' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();
    eventsEmitted = [];

    // Registrar una caja en el repositorio
    const register = new CashRegister({
      id: 'caja-principal',
      name: 'Caja Principal Mostrador',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  it('debe abrir un turno con desglose físico y emitir ShiftOpenedEvent', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);

    const shift = await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 100,
      cashBreakdownCounts: {
        50: 1, // 50
        20: 2, // 40
        10: 1, // 10
      },
      openingNotes: 'Apertura de turno matutino',
    });

    expect(shift.isOpen()).toBe(true);
    expect(shift.initialBalance.toDecimal()).toBe(100);
    expect(shift.calculateExpectedCash().toDecimal()).toBe(100);

    const register = await registerRepo.findById('caja-principal');
    expect(register?.isOpen()).toBe(true);
    expect(register?.activeShiftId).toBe('shift-100');

    expect(eventsEmitted.length).toBe(1);
    expect(eventsEmitted[0]).toBeInstanceOf(ShiftOpenedEvent);
  });

  it('no debe permitir abrir dos turnos simultáneos en la misma caja', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 50,
    });

    await expect(
      openUseCase.execute({
        shiftId: 'shift-101',
        cashRegisterId: 'caja-principal',
        cashier,
        initialAmount: 50,
      })
    ).rejects.toThrow(CashRegisterAlreadyOpenError);
  });

  it('debe registrar cobros con cambio (vuelto) y pagos combinados', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 100, // Hay $100 en caja
    });

    // Venta 1: Ticket de $35 en efectivo. El cliente paga con un billete de $50.
    const result1 = await paymentUseCase.execute({
      shiftId: 'shift-100',
      transactionReference: 'TK-001',
      payments: [
        { id: 'pay-1', method: PaymentMethod.CASH, amount: 35 },
      ],
      tenderedCash: 50,
      performedBy: cashier,
    });

    expect(result1.totalPaid.toDecimal()).toBe(35);
    expect(result1.changeGiven.toDecimal()).toBe(15);
    // Caja ahora tiene: 100 (apertura) + 35 (venta neta) = 135
    const shift = await shiftRepo.findById('shift-100');
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(135);

    // Venta 2: Ticket de $120 pagado mitad en efectivo ($20) y mitad tarjeta ($100)
    const result2 = await paymentUseCase.execute({
      shiftId: 'shift-100',
      transactionReference: 'TK-002',
      payments: [
        { id: 'pay-2a', method: PaymentMethod.CASH, amount: 20 },
        { id: 'pay-2b', method: PaymentMethod.CREDIT_CARD, amount: 100, reference: 'AUTH-9988' },
      ],
      performedBy: cashier,
    });

    expect(result2.totalPaid.toDecimal()).toBe(120);
    expect(result2.movements.length).toBe(2);

    // Caja en efectivo: 135 + 20 = 155
    const updatedShift = await shiftRepo.findById('shift-100');
    expect(updatedShift?.calculateExpectedCash().toDecimal()).toBe(155);
  });

  it('debe rechazar cobro en efectivo si el dinero entregado por el cliente es insuficiente', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 50,
    });

    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-100',
        transactionReference: 'TK-003',
        payments: [{ id: 'pay-1', method: PaymentMethod.CASH, amount: 50 }],
        tenderedCash: 40, // Intentó pagar 50 con solo 40
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidPaymentError);
  });

  it('debe registrar retiros parciales de seguridad (safe drop) y reembolsos', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const movementUseCase = new RecordMovementUseCase(shiftRepo, eventPublisher);
    const refundUseCase = new RecordRefundUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 300,
    });

    // Remesa / blindaje a caja fuerte de $200
    await movementUseCase.execute({
      movementId: 'drop-1',
      shiftId: 'shift-100',
      type: MovementType.SAFE_DROP,
      amount: 200,
      concept: 'Envío de efectivo a bóveda por exceso de fondo',
      performedBy: cashier,
    });

    const shift = await shiftRepo.findById('shift-100');
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(100);

    // Devolución a cliente en efectivo de $30
    await refundUseCase.execute({
      movementId: 'ref-1',
      shiftId: 'shift-100',
      amount: 30,
      paymentMethod: PaymentMethod.CASH,
      concept: 'Devolución de prenda defectuosa',
      referenceId: 'TK-001',
      performedBy: cashier,
    });

    const updatedShift = await shiftRepo.findById('shift-100');
    expect(updatedShift?.calculateExpectedCash().toDecimal()).toBe(70);
  });

  it('debe realizar arqueo intermedio sin cerrar el turno', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const auditUseCase = new AuditCountUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 100,
    });

    const audit = await auditUseCase.execute({
      shiftId: 'shift-100',
      declaredCashAmount: 105, // Se contó 105 en gaveta
      notes: 'Auditoría a mediodía',
    });

    expect(audit.expectedCash.toDecimal()).toBe(100);
    expect(audit.declaredCash.toDecimal()).toBe(105);
    expect(audit.cashDifference.toDecimal()).toBe(5);
    expect(audit.cashStatus).toBe(DiscrepancyStatus.SURPLUS);

    // El turno sigue abierto
    const shift = await shiftRepo.findById('shift-100');
    expect(shift?.isOpen()).toBe(true);
  });

  it('debe cerrar el turno, calcular arqueo final y liberar la caja', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 100,
    });

    // Venta en efectivo $50
    await paymentUseCase.execute({
      shiftId: 'shift-100',
      transactionReference: 'TK-10',
      payments: [{ id: 'p-1', method: PaymentMethod.CASH, amount: 50 }],
      performedBy: cashier,
    });

    // Esperado en efectivo: 150
    // Al cerrar, el cajero cuenta $148 (Faltante de $2)
    const closedShift = await closeUseCase.execute({
      shiftId: 'shift-100',
      declaredCashAmount: 148,
      closingNotes: 'Cierre con faltante de $2 reportado al supervisor',
    });

    expect(closedShift.isClosed()).toBe(true);
    expect(closedShift.status).toBe(ShiftStatus.CLOSED);
    expect(closedShift.reconciliation).toBeDefined();
    expect(closedShift.reconciliation?.expectedCash.toDecimal()).toBe(150);
    expect(closedShift.reconciliation?.declaredCash.toDecimal()).toBe(148);
    expect(closedShift.reconciliation?.cashDifference.toDecimal()).toBe(-2);
    expect(closedShift.reconciliation?.cashStatus).toBe(DiscrepancyStatus.SHORTAGE);

    // La caja debe quedar liberada y lista para otro turno
    const register = await registerRepo.findById('caja-principal');
    expect(register?.isOpen()).toBe(false);
    expect(register?.activeShiftId).toBeNull();

    // Verificamos evento de cierre emitido
    const closeEvent = eventsEmitted.find((e) => e instanceof ShiftClosedEvent);
    expect(closeEvent).toBeDefined();
  });

  it('debe calcular métricas completas del turno con GetShiftSummaryUseCase', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const summaryUseCase = new GetShiftSummaryUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-100',
      cashRegisterId: 'caja-principal',
      cashier,
      initialAmount: 100,
    });

    await paymentUseCase.execute({
      shiftId: 'shift-100',
      transactionReference: 'TK-10',
      payments: [
        { id: 'p-1', method: PaymentMethod.CASH, amount: 40 },
        { id: 'p-2', method: PaymentMethod.DIGITAL_WALLET, amount: 60 },
      ],
      performedBy: cashier,
    });

    const result = await summaryUseCase.execute('shift-100');

    expect(result.movementsCount).toBe(2);
    expect(result.summary.totalSales.toDecimal()).toBe(100);
    expect(result.summary.currentCashInDrawer.toDecimal()).toBe(140);
    expect(result.summary.totalsByMethod[PaymentMethod.CASH].net.toDecimal()).toBe(40);
    expect(result.summary.totalsByMethod[PaymentMethod.DIGITAL_WALLET].net.toDecimal()).toBe(60);
  });
});
