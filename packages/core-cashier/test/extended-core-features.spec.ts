import { describe, it, expect, beforeEach } from 'vitest';
import {
  CashBreakdown,
  CashierTier,
  CashMovement,
  CashRegister,
  CashRegisterStatus,
  CashRoundingPolicy,
  CashShift,
  CreateCashRegisterUseCase,
  EscPosTicketFormatter,
  ExchangeDenominationsUseCase,
  ExchangeRate,
  FeatureDisabledError,
  GetConsolidatedSummaryUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InvalidCashRegisterStatusError,
  InvalidDenominationQuantityError,
  InvalidMoneyAmountError,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  PayOutTipsUseCase,
  RecordPaymentUseCase,
  resolveCashierFeatures,
  UpdateCashRegisterUseCase,
  VoidTransactionUseCase,
  createCashierFeatureFlags,
} from '../src/index.js';

const cashier = { id: 'c1', name: 'Ana Cajera', role: 'CASHIER' };
const supervisor = { id: 's1', name: 'Carlos Sup', role: 'SUPERVISOR' };

describe('Funcionalidades Extendidas del Core & Perfiles por Nivel (BASIC/INTERMEDIATE/ADVANCED)', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository({ isolate: true });
    await registerRepo.save(new CashRegister({ id: 'reg-1', name: 'Caja 1', branchId: 'suc-norte', currency: 'USD' }));
  });

  it('1. Cambio de denominaciones (Bill Break / Feria) actualiza gaveta sin alterar saldo contable', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({
      shiftId: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      cashBreakdownCounts: { 100: 5, 20: 10 }, // 700 USD
    });

    const exchangeUC = new ExchangeDenominationsUseCase(shiftRepo);
    const rec = await exchangeUC.execute({
      exchangeId: 'ex-1',
      shiftId: 'shift-1',
      inBreakdownCounts: { 500: 1 },
      outBreakdownCounts: { 100: 5 },
      performedBy: cashier,
      reason: 'Cambio de billete grande',
      idempotencyKey: 'ex-key-1',
    });

    expect(rec.amount.toDecimal()).toBe(500);

    // Idempotencia: reintentar no duplica
    const replay = await exchangeUC.execute({
      exchangeId: 'ex-1',
      shiftId: 'shift-1',
      inBreakdownCounts: { 500: 1 },
      outBreakdownCounts: { 100: 5 },
      performedBy: cashier,
      idempotencyKey: 'ex-key-1',
    });
    expect(replay.id).toBe('ex-1');

    const shift = (await shiftRepo.findById('shift-1'))!;
    expect(shift.calculateExpectedCash().toDecimal()).toBe(700);
    expect(shift.drawerBreakdown.calculateTotal().toDecimal()).toBe(700);
    expect(shift.drawerBreakdown.getCount(500)).toBe(1);
    expect(shift.drawerBreakdown.getCount(100)).toBe(0);
    expect(shift.denominationExchangeHistory).toHaveLength(1);

    // Si no hay suficientes billetes de 100 para entregar, falla
    await expect(
      exchangeUC.execute({
        exchangeId: 'ex-2',
        shiftId: 'shift-1',
        inBreakdownCounts: { 200: 1 },
        outBreakdownCounts: { 100: 2 },
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidDenominationQuantityError);
  });

  it('2. Anulación atómica de transacción completa multi-método + propina', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'shift-1', cashRegisterId: 'reg-1', cashier, initialAmount: 100 });

    const payUC = new RecordPaymentUseCase(shiftRepo);
    await payUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-900',
      ticketTotal: 150,
      payments: [
        { id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 100 },
        { id: 'p-cash', method: PaymentMethod.CASH, amount: 50 },
      ],
      tip: { id: 't-1', amount: 15, paymentMethod: PaymentMethod.CASH, serverEmployeeId: 'm1', serverName: 'Luis' },
      performedBy: cashier,
    });

    const voidTxUC = new VoidTransactionUseCase(shiftRepo);
    const voids = await voidTxUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-900',
      reason: 'Cliente canceló orden completa',
      authorizedBy: supervisor,
      voidIdPrefix: 'vtx-900',
    });

    expect(voids).toHaveLength(3); // tarjeta + efectivo + propina
    const shift = (await shiftRepo.findById('shift-1'))!;
    expect(shift.calculateSummary().totalSales.toDecimal()).toBe(0);
    expect(shift.calculateSummary().totalTipsCollected.toDecimal()).toBe(0);
    expect(shift.calculateExpectedCash().toDecimal()).toBe(100);
  });

  it('3. Liquidación controlada de propinas por empleado y tope estricto', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'shift-1', cashRegisterId: 'reg-1', cashier, initialAmount: 200 });

    const payUC = new RecordPaymentUseCase(shiftRepo);
    await payUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-1',
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 100 }],
      tip: { id: 'tip-1', amount: 25, paymentMethod: PaymentMethod.CASH, serverEmployeeId: 'emp-1', serverName: 'Pedro' },
      performedBy: cashier,
    });
    await payUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-2',
      payments: [{ id: 'p2', method: PaymentMethod.CREDIT_CARD, amount: 80 }],
      tip: { id: 'tip-2', amount: 10, paymentMethod: PaymentMethod.CREDIT_CARD, serverEmployeeId: 'emp-2', serverName: 'Sofia' },
      performedBy: cashier,
    });

    const tipPayoutUC = new PayOutTipsUseCase(shiftRepo);

    // No puede pagar más de lo que tiene Pedro ($25)
    await expect(
      tipPayoutUC.execute({
        movementId: 'tp-fail',
        shiftId: 'shift-1',
        amount: 30,
        serverEmployeeId: 'emp-1',
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidMoneyAmountError);

    // Liquidar automáticamente el saldo pendiente de Pedro ($25)
    const payout = await tipPayoutUC.execute({
      movementId: 'tp-1',
      shiftId: 'shift-1',
      serverEmployeeId: 'emp-1',
      serverName: 'Pedro',
      performedBy: cashier,
    });
    expect(payout.amount.toDecimal()).toBe(25);

    const shift = (await shiftRepo.findById('shift-1'))!;
    expect(shift.getUnpaidTipsForEmployee('emp-1').toDecimal()).toBe(0);
    expect(shift.getUnpaidTipsForEmployee('emp-2').toDecimal()).toBe(10);
  });

  it('4. Redondeo de efectivo (CashRoundingPolicy) solo afecta componente CASH', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'shift-1', cashRegisterId: 'reg-1', cashier, initialAmount: 100 });

    const payUC = new RecordPaymentUseCase(shiftRepo);
    const res = await payUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-R1',
      ticketTotal: 20.03,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      cashRounding: new CashRoundingPolicy(0.05, 'HALF_UP'),
      tenderedCash: 25,
      performedBy: cashier,
    });

    expect(res.cashRequired.toDecimal()).toBe(20.05);
    expect(res.roundingAdjustment?.toDecimal()).toBe(0.02);
    expect(res.changeGiven.toDecimal()).toBe(4.95);
  });

  it('5. Gestión y estado de CashRegister bloquea apertura si está en MAINTENANCE/INACTIVE', async () => {
    const createRegUC = new CreateCashRegisterUseCase(registerRepo);
    const updateRegUC = new UpdateCashRegisterUseCase(registerRepo);

    const reg2 = await createRegUC.execute({
      id: 'reg-2',
      name: 'Caja Rápida',
      branchId: 'suc-norte',
      currency: 'USD',
      maxCashThreshold: 1000,
    });
    expect(reg2.status).toBe(CashRegisterStatus.ACTIVE);

    await updateRegUC.execute({
      id: 'reg-2',
      name: 'Caja Rápida 2',
      status: CashRegisterStatus.MAINTENANCE,
    });

    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await expect(
      openUC.execute({ shiftId: 's-fail', cashRegisterId: 'reg-2', cashier, initialAmount: 50 })
    ).rejects.toThrow(InvalidCashRegisterStatusError);

    await updateRegUC.execute({ id: 'reg-2', status: CashRegisterStatus.ACTIVE });
    const shift = await openUC.execute({ shiftId: 's-ok', cashRegisterId: 'reg-2', cashier, initialAmount: 50 });
    expect(shift.isOpen()).toBe(true);
  });

  it('6. Reporte consolidado multi-caja por sucursal (GetConsolidatedSummaryUseCase)', async () => {
    const createRegUC = new CreateCashRegisterUseCase(registerRepo);
    await createRegUC.execute({ id: 'reg-2', name: 'Caja 2', branchId: 'suc-norte', currency: 'USD' });
    await createRegUC.execute({ id: 'reg-sur', name: 'Caja Sur', branchId: 'suc-sur', currency: 'USD' });

    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'sh-1', cashRegisterId: 'reg-1', cashier, initialAmount: 100 });
    await openUC.execute({ shiftId: 'sh-2', cashRegisterId: 'reg-2', cashier, initialAmount: 200 });
    await openUC.execute({ shiftId: 'sh-3', cashRegisterId: 'reg-sur', cashier, initialAmount: 50 });

    const payUC = new RecordPaymentUseCase(shiftRepo);
    await payUC.execute({
      shiftId: 'sh-1',
      transactionReference: 'T1',
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 80 }],
      performedBy: cashier,
    });
    await payUC.execute({
      shiftId: 'sh-2',
      transactionReference: 'T2',
      payments: [{ id: 'p2', method: PaymentMethod.CREDIT_CARD, amount: 120 }],
      performedBy: cashier,
    });
    await payUC.execute({
      shiftId: 'sh-3',
      transactionReference: 'T3',
      payments: [{ id: 'p3', method: PaymentMethod.CASH, amount: 999 }],
      performedBy: cashier,
    });

    const consolidatedUC = new GetConsolidatedSummaryUseCase(shiftRepo, registerRepo);
    const norte = await consolidatedUC.execute({ branchId: 'suc-norte' });

    expect(norte.shiftsCount).toBe(2);
    expect(norte.grossSales).toBe(200);
    expect(norte.totalExpectedCash).toBe(380); // 100+80 + 200
    expect(norte.byRegister).toHaveLength(2);
  });

  it('7. Plantillas ESC/POS adicionales (Gasto Menor, Reembolso/Anulación, Relevo)', () => {
    const formatter = new EscPosTicketFormatter({ storeName: 'Mi Tienda', columnWidth: 42 });
    const expenseMov = new CashMovement({
      id: 'mov-g1',
      shiftId: 'shift-1',
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: CashBreakdown.fromJSON({ items: [{ denomination: 20, count: 1 }], total: 20, currency: 'USD' }).calculateTotal(),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Compra de jabón',
      performedBy: cashier,
    });

    const txt = formatter.formatExpenseVoucherPlainText(expenseMov, 'Caja 1');
    expect(txt).toContain('VALE DE GASTO MENOR');
    expect(txt).toContain('Compra de jabón');

    const voidMov = new CashMovement({
      id: 'v-1',
      shiftId: 'shift-1',
      type: MovementType.VOID,
      amount: expenseMov.amount,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      concept: 'Anulación',
      referenceId: 'TK-55',
      performedBy: cashier,
      voidDetails: {
        voidedMovementId: 'p-1',
        reason: 'Error de cobro',
        authorizedBy: supervisor,
        authorizedAt: new Date(),
      },
    });
    const voidTxt = formatter.formatRefundOrVoidReceiptPlainText(voidMov, 'Caja 1');
    expect(voidTxt).toContain('COMPROBANTE DE ANULACION');
    expect(voidTxt).toContain('Carlos Sup');
  });

  it('8. Efectivo entregado en divisa extranjera (foreignTendered) calcula vuelto en moneda base', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'shift-1', cashRegisterId: 'reg-1', cashier, initialAmount: 500 });

    // Tienda USD, cliente paga $15 USD entregando 500 MXN (tasa 1 MXN = 0.05 USD => $25 USD)
    const mxnToUsd = new ExchangeRate({ fromCurrency: 'MXN', toCurrency: 'USD', rate: 0.05 });
    const payUC = new RecordPaymentUseCase(shiftRepo);
    const res = await payUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-FX',
      ticketTotal: 15,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      foreignTendered: { amount: 500, exchangeRate: mxnToUsd },
      performedBy: cashier,
    });

    expect(res.tenderedCash?.toDecimal()).toBe(25);
    expect(res.changeGiven.toDecimal()).toBe(10);
    expect(res.foreignTenderedAmount?.toDecimal()).toBe(500);
    expect(res.foreignTenderedAmount?.currency).toBe('MXN');
  });

  it('9. Sistema de Flags por Nivel (BASIC / INTERMEDIATE / ADVANCED) bloquea capacidades deshabilitadas', async () => {
    const openUC = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUC.execute({ shiftId: 'shift-1', cashRegisterId: 'reg-1', cashier, initialAmount: 100 });

    const basicFlags = resolveCashierFeatures('BASIC' as CashierTier);
    expect(basicFlags.splitPayments).toBe(false);
    expect(basicFlags.escPosPrinting).toBe(true);

    const basicPayUC = new RecordPaymentUseCase(shiftRepo, undefined, { features: 'BASIC' });
    // Pago simple en BASIC funciona
    const simple = await basicPayUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-B1',
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 25 }],
      performedBy: cashier,
    });
    expect(simple.totalPaid.toDecimal()).toBe(25);

    // Pago mixto en BASIC lanza FeatureDisabledError
    await expect(
      basicPayUC.execute({
        shiftId: 'shift-1',
        transactionReference: 'TK-B2',
        payments: [
          { id: 'p2', method: PaymentMethod.CASH, amount: 10 },
          { id: 'p3', method: PaymentMethod.CREDIT_CARD, amount: 10 },
        ],
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    // Perfil personalizado: BASIC + splitPayments habilitado
    const customFlags = createCashierFeatureFlags('BASIC', { splitPayments: true });
    const customPayUC = new RecordPaymentUseCase(shiftRepo, undefined, { features: customFlags });
    const mixed = await customPayUC.execute({
      shiftId: 'shift-1',
      transactionReference: 'TK-B3',
      payments: [
        { id: 'p4', method: PaymentMethod.CASH, amount: 10 },
        { id: 'p5', method: PaymentMethod.CREDIT_CARD, amount: 10 },
      ],
      performedBy: cashier,
    });
    expect(mixed.totalPaid.toDecimal()).toBe(20);
  });
});
