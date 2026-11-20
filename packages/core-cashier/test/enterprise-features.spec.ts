import { beforeEach, describe, expect, it } from 'vitest';
import {
  CashRegister,
  CloseShiftUseCase,
  CrossMethodRefundDisallowedError,
  ExpenseCategory,
  GenerateAuditReportUseCase,
  HandoverShiftUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  PaymentVoidedEvent,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  RecordRefundUseCase,
  ShiftHandoverEvent,
  UnauthorizedVoidError,
  VoidPaymentUseCase,
} from '../src/index.js';

describe('Funcionalidades Empresariales Avanzadas (Tips, Expenses, Handover, Voids, Float & Reports X/Z)', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  let eventsEmitted: any[];

  const eventPublisher = (event: any) => {
    eventsEmitted.push(event);
  };

  const cashier1 = { id: 'usr-1', name: 'Laura Gómez' };
  const cashier2 = { id: 'usr-2', name: 'Roberto Díaz' };
  const supervisor = { id: 'sup-1', name: 'Marcos Supervisor' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();
    eventsEmitted = [];

    const register = new CashRegister({
      id: 'caja-pos-01',
      name: 'Caja Principal Restaurante',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  it('debe registrar propinas recaudadas y separarlas contablemente de las ventas netas', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo, eventPublisher);
    const movementUseCase = new RecordMovementUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-gastronomy-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 200,
    });

    // Venta de $80 con tarjeta + $10 de propina para mesero "Carlos"
    const result = await paymentUseCase.execute({
      shiftId: 'shift-gastronomy-1',
      transactionReference: 'MESA-04',
      ticketTotal: 80,
      payments: [
        { id: 'pay-card', method: PaymentMethod.CREDIT_CARD, amount: 80 },
      ],
      tip: {
        id: 'tip-01',
        amount: 10,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        serverEmployeeId: 'server-10',
        serverName: 'Carlos Mesero',
      },
      performedBy: cashier1,
    });

    expect(result.tipMovement).toBeDefined();
    expect(result.tipMovement?.amount.toDecimal()).toBe(10);

    const shift = await shiftRepo.findById('shift-gastronomy-1');
    const summary = shift!.calculateSummary();

    // Venta del negocio sigue siendo $80 (la propina no infla la venta comercial)
    expect(summary.totalSales.toDecimal()).toBe(80);
    expect(summary.totalTipsCollected.toDecimal()).toBe(10);
    expect(summary.unpaidTipsBalance.toDecimal()).toBe(10);

    // Liquidar propina al mesero en efectivo desde caja
    await movementUseCase.execute({
      movementId: 'payout-1',
      shiftId: 'shift-gastronomy-1',
      type: MovementType.TIP_PAYOUT,
      amount: 10,
      paymentMethod: PaymentMethod.CASH,
      concept: 'Pago de propina a Carlos Mesero',
      performedBy: cashier1,
    });

    const updatedSummary = shift!.calculateSummary();
    expect(updatedSummary.totalTipsPaidOut.toDecimal()).toBe(10);
    expect(updatedSummary.unpaidTipsBalance.toDecimal()).toBe(0);
  });

  it('debe categorizar gastos menores (Petty Cash) con datos de proveedor y factura', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const movementUseCase = new RecordMovementUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-petty-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 300,
    });

    await movementUseCase.execute({
      movementId: 'exp-1',
      shiftId: 'shift-petty-1',
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: 45.50,
      paymentMethod: PaymentMethod.CASH,
      concept: 'Compra de cloro y bolsas de basura',
      expenseCategory: ExpenseCategory.CLEANING_SUPPLIES,
      expenseSupplierName: 'Distribuidora Limpieza S.A.',
      expenseSupplierTaxId: 'TAX-998877',
      expenseInvoiceNumber: 'FAC-00192',
      performedBy: cashier1,
    });

    const shift = await shiftRepo.findById('shift-petty-1');
    const summary = shift!.calculateSummary();

    expect(summary.expensesByCategory[ExpenseCategory.CLEANING_SUPPLIES].toDecimal()).toBe(45.50);
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(254.50);
  });

  it('debe realizar relevo de cajero (Handover) transfiriendo la custodia de la gaveta', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const handoverUseCase = new HandoverShiftUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-handover-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 200,
    });

    // Laura entrega el turno a Roberto
    const handoverResult = await handoverUseCase.execute({
      shiftId: 'shift-handover-1',
      incomingCashier: cashier2,
      declaredCashAmount: 200,
      notes: 'Cambio de turno sin novedad',
    });

    expect(handoverResult.shift.cashier.id).toBe(cashier2.id);
    expect(handoverResult.shift.handoverHistory.length).toBe(1);
    expect(handoverResult.shift.handoverHistory[0].outgoingCashier.id).toBe(cashier1.id);

    const event = eventsEmitted.find((e) => e instanceof ShiftHandoverEvent);
    expect(event).toBeDefined();
    expect(event.outgoingCashier.id).toBe(cashier1.id);
    expect(event.incomingCashier.id).toBe(cashier2.id);
  });

  it('debe anular una venta previa exigiendo autorización de supervisor', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo, eventPublisher);
    const voidUseCase = new VoidPaymentUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-void-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 100,
    });

    const sale = await paymentUseCase.execute({
      shiftId: 'shift-void-1',
      transactionReference: 'TK-ERR-1',
      ticketTotal: 40,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      performedBy: cashier1,
    });

    const movToVoidId = sale.movements[0].id;

    // Intento sin supervisor falla
    await expect(
      voidUseCase.execute({
        shiftId: 'shift-void-1',
        movementIdToVoid: movToVoidId,
        reason: 'Error de cobro',
        authorizedBy: { id: '', name: '' },
      })
    ).rejects.toThrow(UnauthorizedVoidError);

    // Anulación autorizada por supervisor
    const voidMov = await voidUseCase.execute({
      shiftId: 'shift-void-1',
      movementIdToVoid: movToVoidId,
      reason: 'Cliente canceló el pedido por demora',
      authorizedBy: supervisor,
    });

    expect(voidMov.type).toBe(MovementType.VOID);
    expect(voidMov.voidDetails?.authorizedBy.id).toBe(supervisor.id);

    const shift = await shiftRepo.findById('shift-void-1');
    const original = shift?.movements.find((m) => m.id === movToVoidId);
    expect(original?.isVoided).toBe(true);

    // Efectivo en caja vuelve al inicial ($100)
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(100);

    const voidEvent = eventsEmitted.find((e) => e instanceof PaymentVoidedEvent);
    expect(voidEvent).toBeDefined();
  });

  it('debe aplicar regla antifraude bloqueando reembolsos en efectivo si la compra fue con tarjeta', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const refundUseCase = new RecordRefundUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-fraud-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 200,
    });

    await expect(
      refundUseCase.execute({
        movementId: 'ref-fail',
        shiftId: 'shift-fraud-1',
        amount: 50,
        paymentMethod: PaymentMethod.CASH,
        originalPaymentMethod: PaymentMethod.CREDIT_CARD,
        disallowCrossMethodRefund: true, // Antifraude activo
        concept: 'Intento de devolución en efectivo de compra con tarjeta',
        performedBy: cashier1,
      })
    ).rejects.toThrow(CrossMethodRefundDisallowedError);
  });

  it('debe soportar fondo fijo retenido (Float Retention) y generar reportes oficiales X y Z', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo);
    const reportUseCase = new GenerateAuditReportUseCase(shiftRepo, registerRepo);

    await openUseCase.execute({
      shiftId: 'shift-report-1',
      cashRegisterId: 'caja-pos-01',
      cashier: cashier1,
      initialAmount: 100,
    });

    await paymentUseCase.execute({
      shiftId: 'shift-report-1',
      transactionReference: 'TK-Z1',
      ticketTotal: 400,
      payments: [
        { id: 'p-cash', method: PaymentMethod.CASH, amount: 200 },
        { id: 'p-card', method: PaymentMethod.DEBIT_CARD, amount: 200 },
      ],
      performedBy: cashier1,
    });

    // Generar Reporte X (parcial mientras la caja está abierta)
    const reportX = await reportUseCase.execute('shift-report-1', 'X');
    expect(reportX.reportType).toBe('X');
    expect(reportX.isFiscalFinalCut).toBe(false);
    expect(reportX.grossSales).toBe(400);
    expect(reportX.currentCashInDrawer).toBe(300); // 100 + 200

    // Cierre de caja: Se cuentan $300 en gaveta.
    // Se define que $100 se quedan retenidos en caja como fondo base (Float) para mañana,
    // y los otros $200 van como remesa a bóveda/banco.
    const closed = await closeUseCase.execute({
      shiftId: 'shift-report-1',
      declaredCashAmount: 300,
      retainedFloatAmount: 100,
      closingNotes: 'Cierre con retención de fondo base',
      posVoucherBatches: [
        {
          terminalId: 'POS-TERM-01',
          batchNumber: 'LOTE-778',
          paymentMethod: PaymentMethod.DEBIT_CARD,
          voucherCount: 1,
          totalAmount: 200,
        },
      ],
    });

    expect(closed.reconciliation?.retainedFloatAmount?.toDecimal()).toBe(100);
    expect(closed.reconciliation?.bankDepositAmount?.toDecimal()).toBe(200);

    // Generar Reporte Z (corte final fiscal)
    const reportZ = await reportUseCase.execute('shift-report-1', 'Z');
    expect(reportZ.reportType).toBe('Z');
    expect(reportZ.isFiscalFinalCut).toBe(true);
    expect(reportZ.reconciliation?.retainedFloat).toBe(100);
    expect(reportZ.reconciliation?.bankDeposit).toBe(200);
    expect(reportZ.reconciliation?.posVoucherBatches?.length).toBe(1);
    expect(reportZ.reconciliation?.posVoucherBatches?.[0].batchNumber).toBe('LOTE-778');
  });
});
