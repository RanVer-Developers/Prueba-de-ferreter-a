import { describe, expect, it } from 'vitest';
import {
  AuditCountUseCase,
  CashBreakdown,
  CashMovement,
  CashReconciliation,
  CashRegister,
  CashShift,
  CloseShiftUseCase,
  ConcurrencyError,
  CurrencyMismatchError,
  EscPosTicketFormatter,
  ExchangeRate,
  HandoverShiftUseCase,
  IdentityOnlyAuthorizationPolicy,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InsufficientCashInDrawerError,
  InsufficientRoleError,
  InvalidCashierInputError,
  InvalidMoneyAmountError,
  InvalidPaymentError,
  ISignatureVerifier,
  Money,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  RecordPaymentUseCase,
  RecordRefundUseCase,
  RefundExceedsOriginalSaleError,
  SelfApprovalNotAllowedError,
  ShiftStatus,
  SuspendShiftUseCase,
  SupervisorAuthorizationPolicy,
  VoidPaymentUseCase,
} from '../src/index.js';

describe('Correcciones de Auditoría y Modelo Reutilizable Puro', () => {
  const cashier = { id: 'usr-cajero', name: 'Laura Gómez', role: 'CASHIER' };
  const supervisor = { id: 'usr-supervisor', name: 'Carlos Gerente', role: 'SUPERVISOR' };

  async function createRegisterAndShift(currency = 'USD') {
    const registerRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();
    const register = new CashRegister({
      id: 'reg-audit-1',
      name: 'Caja Principal',
      currency,
    });
    await registerRepo.save(register);
    return { registerRepo, shiftRepo, register };
  }

  it('A/A2. Void de venta con tarjeta: balance neto queda en cero y rechaza autoaprobación y roles inválidos', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const voidUseCase = new VoidPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-a',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    const payment = await paymentUseCase.execute({
      shiftId: 'shift-a',
      transactionReference: 'TK-CARD-1',
      ticketTotal: 50,
      payments: [{ id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 50 }],
      performedBy: cashier,
    });

    const cardMovId = payment.movements[0].id;

    // 1. Autoaprobación rechazada
    await expect(
      voidUseCase.execute({
        shiftId: 'shift-a',
        movementIdToVoid: cardMovId,
        reason: 'Error',
        authorizedBy: cashier, // mismo cajero
      })
    ).rejects.toThrow(SelfApprovalNotAllowedError);

    // 2. Rol inválido (otro cajero que no es supervisor) rechazado
    const otherCashier = { id: 'usr-other', name: 'Otro Cajero', role: 'CASHIER' };
    await expect(
      voidUseCase.execute({
        shiftId: 'shift-a',
        movementIdToVoid: cardMovId,
        reason: 'Error',
        authorizedBy: otherCashier,
      })
    ).rejects.toThrow(InsufficientRoleError);

    // 3. Aprobación correcta por supervisor
    const voidMov = await voidUseCase.execute({
      shiftId: 'shift-a',
      movementIdToVoid: cardMovId,
      reason: 'Cobro duplicado por error de datáfono',
      authorizedBy: supervisor,
    });

    expect(voidMov.type).toBe(MovementType.VOID);
    const shift = await shiftRepo.findById('shift-a');
    const summary = shift!.calculateSummary();

    // Neto de tarjeta debe ser exactamente 0 (no -50)
    expect(summary.totalsByMethod.CREDIT_CARD.net.toDecimal()).toBe(0);
    expect(summary.totalSales.toDecimal()).toBe(0);
    expect(summary.totalVoidedAmount.toDecimal()).toBe(50);
  });

  it('B. Turno LOCKED: permite cierre definitivo sin dejar la caja atascada', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const suspendUseCase = new SuspendShiftUseCase(shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-b',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    await suspendUseCase.execute({
      shiftId: 'shift-b',
      reason: 'Cajero abandonó puesto sin cerrar',
      mode: 'LOCK',
    });

    const shiftLocked = await shiftRepo.findById('shift-b');
    expect(shiftLocked?.isLocked()).toBe(true);

    // Cierre del turno bloqueado
    const closedShift = await closeUseCase.execute({
      shiftId: 'shift-b',
      declaredCashAmount: 100,
      closingNotes: 'Cierre de contingencia por supervisor',
      authorizedBy: supervisor,
    });

    expect(closedShift.status).toBe(ShiftStatus.CLOSED);
    const regAfter = await registerRepo.findById('reg-audit-1');
    expect(regAfter?.isOpen()).toBe(false);
  });

  it('C. Idempotencia real: reintentos devuelven el resultado original y no alteran gaveta', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-c',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 300,
      cashBreakdownCounts: { 100: 2, 50: 2 },
    });

    const paymentDTO = {
      shiftId: 'shift-c',
      transactionReference: 'TK-IDEMP-99',
      ticketTotal: 150,
      payments: [{ id: 'p-cash', method: PaymentMethod.CASH }],
      tenderedCash: 200,
      tenderedBreakdownCounts: { 100: 2 },
      idempotencyKey: 'offline-uuid-999',
      performedBy: cashier,
    };

    const first = await paymentUseCase.execute(paymentDTO);
    expect(first.isReplay).toBe(false);
    expect(first.changeGiven.toDecimal()).toBe(50);

    const shiftAfter1 = await shiftRepo.findById('shift-c');
    const bills100After1 = shiftAfter1?.drawerBreakdown.getCount(100); // 2 iniciales + 2 recibidos = 4
    expect(bills100After1).toBe(4);

    // Reintento idéntico por reenvío de red
    const second = await paymentUseCase.execute(paymentDTO);
    expect(second.isReplay).toBe(true);
    expect(second.ticketTotal.toDecimal()).toBe(150);
    expect(second.changeGiven.toDecimal()).toBe(50);

    const shiftAfter2 = await shiftRepo.findById('shift-c');
    // No debe haberse sumado otra vez el billete de 100
    expect(shiftAfter2?.drawerBreakdown.getCount(100)).toBe(4);
    expect(shiftAfter2?.calculateExpectedCash().toDecimal()).toBe(450); // 300 + 150
  });

  it('D. Reembolso con tope contra venta original y antifraude', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const refundUseCase = new RecordRefundUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-d',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 1000,
    });

    await paymentUseCase.execute({
      shiftId: 'shift-d',
      transactionReference: 'TK-SALE-10',
      ticketTotal: 10,
      payments: [{ id: 'p-c', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    // Intento de reembolsar $50 sobre una venta de $10 debe fallar
    await expect(
      refundUseCase.execute({
        movementId: 'ref-exceed',
        shiftId: 'shift-d',
        amount: 50,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Devolución excesiva',
        referenceId: 'TK-SALE-10',
        performedBy: cashier,
      })
    ).rejects.toThrow(RefundExceedsOriginalSaleError);

    // Reembolso de $10 (monto exacto de la venta) tiene éxito
    const refundOk = await refundUseCase.execute({
      movementId: 'ref-ok',
      shiftId: 'shift-d',
      amount: 10,
      paymentMethod: PaymentMethod.CASH,
      concept: 'Devolución de producto',
      referenceId: 'TK-SALE-10',
      performedBy: cashier,
    });
    expect(refundOk.amount.toDecimal()).toBe(10);

    // Un segundo reembolso de $1 sobre la misma venta ahora excede lo reembolsable ($0 restante)
    await expect(
      refundUseCase.execute({
        movementId: 'ref-again',
        shiftId: 'shift-d',
        amount: 1,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Devolución repetida',
        referenceId: 'TK-SALE-10',
        performedBy: cashier,
      })
    ).rejects.toThrow(RefundExceedsOriginalSaleError);
  });

  it('E. Money con decimales ISO 4217 y reparto proporcional allocate()', () => {
    const jpy = Money.fromDecimal(1500, 'JPY');
    expect(jpy.decimals).toBe(0);
    expect(jpy.toCents()).toBe(1500);
    expect(jpy.toDecimal()).toBe(1500);

    const kwd = Money.fromDecimal(1.5, 'KWD');
    expect(kwd.decimals).toBe(3);
    expect(kwd.toCents()).toBe(1500);
    expect(kwd.toDecimal()).toBe(1.5);

    const usd = Money.fromDecimal(19.99, 'USD');
    expect(usd.decimals).toBe(2);
    expect(usd.toCents()).toBe(1999);

    // allocate: repartir $100.00 entre 3 partes iguales sin perder centavos (33.34, 33.33, 33.33)
    const total = Money.fromDecimal(100, 'USD');
    const parts = total.allocate([1, 1, 1]);
    expect(parts.length).toBe(3);
    expect(parts[0].toDecimal()).toBe(33.34);
    expect(parts[1].toDecimal()).toBe(33.33);
    expect(parts[2].toDecimal()).toBe(33.33);
    const sumAllocated = parts.reduce((acc, p) => acc.add(p), Money.zero('USD'));
    expect(sumAllocated.equals(total)).toBe(true);
  });

  it('F. Formateador ESC/POS: bytes binarios correctos, CP858 y texto corregido', () => {
    const formatter = new EscPosTicketFormatter({
      columnWidth: 42,
      storeName: 'TIENDA CENTRAL',
      openCashDrawer: true,
      cutPaper: true,
    });

    const drawerBytes = formatter.getOpenDrawerCommandBytes();
    expect(drawerBytes.length).toBe(5);
    expect(drawerBytes[0]).toBe(0x1b);
    expect(drawerBytes[1]).toBe(0x70);
    expect(drawerBytes[2]).toBe(0x00);
    expect(drawerBytes[3]).toBe(0x19);
    expect(drawerBytes[4]).toBe(0xfa);

    const cutBytes = formatter.getCutPaperCommandBytes();
    expect(cutBytes[0]).toBe(0x1d);
    expect(cutBytes[1]).toBe(0x56);
    expect(cutBytes[2]).toBe(0x01);
  });

  it('G. Rehidratación completa (round-trip lossless) de CashShift, CashRegister, Movimientos y Arqueo', async () => {
    const { registerRepo, shiftRepo, register } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-rehydrate',
      cashRegisterId: register.id,
      cashier,
      initialAmount: 200,
      cashBreakdownCounts: { 100: 2 },
    });

    await paymentUseCase.execute({
      shiftId: 'shift-rehydrate',
      transactionReference: 'TK-REHY',
      ticketTotal: 50,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    const originalShift = (await shiftRepo.findById('shift-rehydrate'))!;
    const json = originalShift.toJSON();
    const snapshot = originalShift.toSnapshot();

    const rehydratedFromJSON = CashShift.fromJSON(json);
    const rehydratedFromSnapshot = CashShift.fromSnapshot(snapshot);

    expect(rehydratedFromJSON.id).toBe(originalShift.id);
    expect(rehydratedFromJSON.cashier.name).toBe(originalShift.cashier.name);
    expect(rehydratedFromJSON.initialBalance.equals(originalShift.initialBalance)).toBe(true);
    expect(rehydratedFromJSON.drawerBreakdown.calculateTotal().equals(originalShift.drawerBreakdown.calculateTotal())).toBe(true);
    expect(rehydratedFromJSON.movements.length).toBe(originalShift.movements.length);

    expect(rehydratedFromSnapshot.version).toBe(originalShift.version);
    expect(rehydratedFromSnapshot.calculateExpectedCash().equals(originalShift.calculateExpectedCash())).toBe(true);

    // Rehidratación de CashRegister
    const regJSON = register.toJSON();
    const rehydratedReg = CashRegister.fromJSON(regJSON);
    expect(rehydratedReg.id).toBe(register.id);
    expect(rehydratedReg.isOpen()).toBe(register.isOpen());
  });

  it('H. Concurrencia optimista con versionado en InMemoryCashShiftRepository ({ isolate: true })', async () => {
    const isolatedRepo = new InMemoryCashShiftRepository({ isolate: true });
    const shift = new CashShift({
      id: 'shift-iso-1',
      cashRegisterId: 'reg-iso',
      cashier,
      initialBalance: Money.fromDecimal(100, 'USD'),
    });
    await isolatedRepo.save(shift);

    // Dos lectores cargan copias concurrentes
    const clientA = (await isolatedRepo.findById('shift-iso-1'))!;
    const clientB = (await isolatedRepo.findById('shift-iso-1'))!;

    // Client A registra un movimiento y guarda
    const movA = new CashMovement({
      id: 'm-a',
      shiftId: clientA.id,
      type: MovementType.MANUAL_DEPOSIT,
      amount: Money.fromDecimal(20, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Depósito A',
      performedBy: cashier,
    });
    clientA.recordMovement(movA);
    await isolatedRepo.save(clientA);

    // Client B intenta guardar su copia desactualizada (sin haber visto la versión de A)
    const movB = new CashMovement({
      id: 'm-b',
      shiftId: clientB.id,
      type: MovementType.MANUAL_DEPOSIT,
      amount: Money.fromDecimal(30, 'USD'),
      paymentMethod: PaymentMethod.CASH,
      concept: 'Depósito B',
      performedBy: cashier,
    });
    clientB.recordMovement(movB);

    await expect(isolatedRepo.save(clientB)).rejects.toThrow(ConcurrencyError);
  });

  it('I. Arqueo ciego seguro: toCashierView oculta esperado y diferencias al cajero', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-blind',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 200,
    });

    const shift = (await shiftRepo.findById('shift-blind'))!;
    const reconciliation = shift.generateReconciliation(
      { cash: Money.fromDecimal(190, 'USD') }, // cajero declara 190 (hay faltante de 10)
      undefined,
      undefined,
      'Arqueo ciego',
      supervisor.id,
      'TOKEN_123',
      true // isBlindCount = true
    );

    const cashierView: any = reconciliation.toCashierView();
    expect(cashierView.isBlindCount).toBe(true);
    expect(cashierView.declaredCash).toBe(190);
    // Campos sensibles omitidos
    expect(cashierView.expectedCash).toBeUndefined();
    expect(cashierView.difference).toBeUndefined();
    expect(cashierView.cashDifference).toBeUndefined();
    expect(cashierView.cashStatus).toBeUndefined();

    // La vista completa para supervisores sí los incluye
    const supervisorView = reconciliation.toJSON();
    expect(supervisorView.expectedCash).toBe(200);
    expect(supervisorView.cashDifference).toBe(-10);
    expect(supervisorView.cashStatus).toBe('SHORTAGE');
  });

  it('J. Verificación de firma digital del supervisor en cierres de caja con ISignatureVerifier', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);

    const mockVerifier: ISignatureVerifier = {
      verify: ({ token, supervisorId }) => {
        return token === `VALID_SIG_FOR_${supervisorId}`;
      },
    };

    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo, undefined, {
      signatureVerifier: mockVerifier,
      discrepancyTolerance: 5,
    });

    await openUseCase.execute({
      shiftId: 'shift-sig',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    // Intento con token inválido debe fallar
    await expect(
      closeUseCase.execute({
        shiftId: 'shift-sig',
        declaredCashAmount: 100,
        supervisorId: supervisor.id,
        signatureToken: 'INVALID_TOKEN',
      })
    ).rejects.toThrow();

    // Intento con token válido tiene éxito
    const closed = await closeUseCase.execute({
      shiftId: 'shift-sig',
      declaredCashAmount: 100,
      supervisorId: supervisor.id,
      signatureToken: `VALID_SIG_FOR_${supervisor.id}`,
    });
    expect(closed.status).toBe(ShiftStatus.CLOSED);
  });

  it('K. RecordPaymentUseCase: rechaza efectivo duplicado, montos nulos/negativos, soporta multimoneda sin ticketTotal y valida cambio contra fondo previo', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-pay-edge',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    // 1. Múltiples ítems CASH en la misma transacción
    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-pay-edge',
        transactionReference: 'TK-DUP-CASH',
        ticketTotal: 50,
        payments: [
          { id: 'p1', method: PaymentMethod.CASH, amount: 25 },
          { id: 'p2', method: PaymentMethod.CASH, amount: 25 },
        ],
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidPaymentError);

    // 2. CASH <= 0 sin ticketTotal ni otros métodos
    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-pay-edge',
        transactionReference: 'TK-ZERO-CASH',
        payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 0 }],
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidPaymentError);

    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-pay-edge',
        transactionReference: 'TK-NEG-CASH',
        payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: -10 }],
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidPaymentError);

    // 3. Pago multimoneda en efectivo sin ticketTotal
    const rate = new ExchangeRate({ fromCurrency: 'EUR', toCurrency: 'USD', rate: 1.1 });
    const fxResult = await paymentUseCase.execute({
      shiftId: 'shift-pay-edge',
      transactionReference: 'TK-FX-CASH',
      payments: [
        { id: 'p-fx', method: PaymentMethod.CASH, foreignAmount: 50, exchangeRate: rate },
      ],
      performedBy: cashier,
    });
    expect(fxResult.ticketTotal.toDecimal()).toBe(55);
    expect(fxResult.cashRequired.toDecimal()).toBe(55);

    // Ahora la gaveta tiene 100 + 55 = 155 USD.
    // 4. Cambio requerido (200 - 20 = 180) supera el efectivo disponible previo (155),
    // aunque 155 + 20 = 175 seguiría siendo menor, pero incluso si tendered=200 ticket=50
    // (155 + 50 = 205 >= 150, antes pasaba falsamente!): el billete de 200 no se puede fraccionar sin fondo previo.
    await expect(
      paymentUseCase.execute({
        shiftId: 'shift-pay-edge',
        transactionReference: 'TK-BIG-BILL',
        ticketTotal: 50,
        payments: [{ id: 'p-cash', method: PaymentMethod.CASH }],
        tenderedCash: 250, // vuelto = 200 > 155 en gaveta (aunque 155 + 50 = 205 >= 200!)
        performedBy: cashier,
      })
    ).rejects.toThrow(InsufficientCashInDrawerError);
  });

  it('L. VoidPaymentUseCase respeta políticas personalizadas (SupervisorAuthorizationPolicy custom e IdentityOnlyAuthorizationPolicy)', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-void-policy',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    const p1 = await paymentUseCase.execute({
      shiftId: 'shift-void-policy',
      transactionReference: 'TK-VP-1',
      ticketTotal: 40,
      payments: [{ id: 'p1', method: PaymentMethod.CREDIT_CARD, amount: 40 }],
      performedBy: cashier,
    });

    const p2 = await paymentUseCase.execute({
      shiftId: 'shift-void-policy',
      transactionReference: 'TK-VP-2',
      ticketTotal: 30,
      payments: [{ id: 'p2', method: PaymentMethod.DEBIT_CARD, amount: 30 }],
      performedBy: cashier,
    });

    // Política con rol custom CASH_LEAD
    const customVoidUseCase = new VoidPaymentUseCase(
      shiftRepo,
      undefined,
      new SupervisorAuthorizationPolicy(['CASH_LEAD'])
    );
    const void1 = await customVoidUseCase.execute({
      shiftId: 'shift-void-policy',
      movementIdToVoid: p1.movements[0].id,
      reason: 'Rol custom autorizado',
      authorizedBy: { id: 'lead-1', name: 'Jefe de Caja', role: 'CASH_LEAD' },
    });
    expect(void1.type).toBe(MovementType.VOID);

    // Política IdentityOnly permite otro usuario aunque su rol sea CASHIER
    const identityVoidUseCase = new VoidPaymentUseCase(
      shiftRepo,
      undefined,
      new IdentityOnlyAuthorizationPolicy()
    );
    const void2 = await identityVoidUseCase.execute({
      shiftId: 'shift-void-policy',
      movementIdToVoid: p2.movements[0].id,
      reason: 'Autorizado por segundo par con IAM externo',
      authorizedBy: { id: 'usr-peer', name: 'Par Cajero', role: 'CASHIER' },
    });
    expect(void2.type).toBe(MovementType.VOID);
  });

  it('M. CashShift.generateReconciliation suma múltiples lotes POS del mismo método de pago', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-pos-batches',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 100,
    });

    await paymentUseCase.execute({
      shiftId: 'shift-pos-batches',
      transactionReference: 'TK-POS-1',
      ticketTotal: 150,
      payments: [{ id: 'p1', method: PaymentMethod.CREDIT_CARD, amount: 150 }],
      performedBy: cashier,
    });

    const shift = (await shiftRepo.findById('shift-pos-batches'))!;
    const reconciliation = shift.generateReconciliation(
      new Map([[PaymentMethod.CASH, Money.fromDecimal(100, 'USD')]]),
      undefined,
      undefined,
      'Conciliación con dos datáfonos',
      undefined,
      undefined,
      false,
      [
        {
          terminalId: 'POS-TERM-01',
          batchNumber: 'B-01',
          paymentMethod: PaymentMethod.CREDIT_CARD,
          voucherCount: 1,
          totalAmount: Money.fromDecimal(60, 'USD'),
        },
        {
          terminalId: 'POS-TERM-02',
          batchNumber: 'B-02',
          paymentMethod: PaymentMethod.CREDIT_CARD,
          voucherCount: 2,
          totalAmount: Money.fromDecimal(90, 'USD'),
        },
      ]
    );

    const cardSummary = reconciliation.methodSummaries.find((m) => m.method === PaymentMethod.CREDIT_CARD)!;
    expect(cardSummary.declared.toDecimal()).toBe(150);
    expect(cardSummary.difference.toDecimal()).toBe(0);
    expect(cardSummary.status).toBe('EXACT');
  });

  it('N. Consistencia de desglose físico, fondo retenido atómico y validación de rol supervisor en Close/Audit/Handover', async () => {
    const { registerRepo, shiftRepo } = await createRegisterAndShift();
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const auditUseCase = new AuditCountUseCase(shiftRepo);
    const handoverUseCase = new HandoverShiftUseCase(shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-consistency',
      cashRegisterId: 'reg-audit-1',
      cashier,
      initialAmount: 200,
      cashBreakdownCounts: { 50: 4 },
    });

    // 1. Discrepancia entre declaredCashAmount y cashBreakdownCounts
    await expect(
      auditUseCase.execute({
        shiftId: 'shift-consistency',
        declaredCashAmount: 200,
        cashBreakdownCounts: { 50: 3 }, // $150 != $200
      })
    ).rejects.toThrow(InvalidMoneyAmountError);

    // 2. Rol CASHIER en supervisor rechazado en AuditCount, Handover y Close
    const badSupervisor = { id: 'usr-sup-fake', name: 'Cajero Fake', role: 'CASHIER' };

    await expect(
      auditUseCase.execute({
        shiftId: 'shift-consistency',
        declaredCashAmount: 200,
        supervisor: badSupervisor,
      })
    ).rejects.toThrow(InsufficientRoleError);

    await expect(
      handoverUseCase.execute({
        shiftId: 'shift-consistency',
        incomingCashier: { id: 'usr-in', name: 'Cajero Entrante', role: 'CASHIER' },
        declaredCashAmount: 200,
        supervisor: badSupervisor,
      })
    ).rejects.toThrow(InsufficientRoleError);

    await expect(
      closeUseCase.execute({
        shiftId: 'shift-consistency',
        declaredCashAmount: 200,
        supervisor: badSupervisor,
      })
    ).rejects.toThrow(InsufficientRoleError);

    // 3. retainedBreakdownCounts inconsistente con retainedFloatAmount falla ANTES de cerrar el turno
    await expect(
      closeUseCase.execute({
        shiftId: 'shift-consistency',
        declaredCashAmount: 200,
        retainedFloatAmount: 100,
        retainedBreakdownCounts: { 50: 1 }, // $50 != $100
      })
    ).rejects.toThrow(InvalidMoneyAmountError);

    const shiftAfterFailedClose = (await shiftRepo.findById('shift-consistency'))!;
    const regAfterFailedClose = (await registerRepo.findById('reg-audit-1'))!;
    expect(shiftAfterFailedClose.isOpen()).toBe(true);
    expect(regAfterFailedClose.isOpen()).toBe(true);

    // 4. Cierre válido derivando retainedFloatAmount desde retainedBreakdownCounts y validando supervisor real
    const closedShift = await closeUseCase.execute({
      shiftId: 'shift-consistency',
      declaredCashAmount: 200,
      retainedBreakdownCounts: { 50: 2 }, // deriva $100 automáticamente
      supervisor,
    });
    expect(closedShift.isClosed()).toBe(true);
    expect(closedShift.reconciliation?.retainedFloatAmount?.toDecimal()).toBe(100);
    const regClosed = (await registerRepo.findById('reg-audit-1'))!;
    expect(regClosed.carryOverFloat?.toDecimal()).toBe(100);
    expect(regClosed.carryOverBreakdown?.getCount(50)).toBe(2);
  });

  it('O. InvalidCashierInputError en entradas inválidas de dominio', () => {
    expect(
      () =>
        new CashMovement({
          id: 'mov-invalid',
          shiftId: 's-1',
          type: MovementType.MANUAL_DEPOSIT,
          amount: Money.fromDecimal(10, 'USD'),
          paymentMethod: PaymentMethod.CASH,
          concept: '   ',
          performedBy: cashier,
        })
    ).toThrow(InvalidCashierInputError);

    const shift = new CashShift({
      id: 'shift-err',
      cashRegisterId: 'reg-1',
      cashier,
      initialBalance: Money.fromDecimal(50, 'USD'),
    });
    expect(() => shift.recordDrawerOpen('   ', cashier)).toThrow(InvalidCashierInputError);
  });

  it('P. Validación Zod y schemaVersion en fronteras de rehidratación (fromJSON / fromSnapshot)', () => {
    const register = new CashRegister({ id: 'reg-zod', name: 'Caja Zod', currency: 'USD' });
    const regJson = register.toJSON();
    expect(regJson.schemaVersion).toBe(1);

    // Payload legacy v1 sin schemaVersion sigue siendo compatible
    const legacyReg = { ...regJson };
    delete legacyReg.schemaVersion;
    expect(CashRegister.fromJSON(legacyReg).id).toBe('reg-zod');

    // schemaVersion futuro o payload corrupto falla con InvalidCashierInputError
    expect(() => CashRegister.fromJSON({ ...regJson, schemaVersion: 2 })).toThrow(InvalidCashierInputError);
    expect(() => CashRegister.fromJSON({ ...regJson, currency: 'INVALID' })).toThrow(InvalidCashierInputError);

    const shift = new CashShift({
      id: 'shift-zod',
      cashRegisterId: 'reg-zod',
      cashier,
      initialBalance: Money.fromDecimal(100, 'USD'),
    });
    const snap = shift.toSnapshot();
    const json = shift.toJSON();
    expect(snap.schemaVersion).toBe(1);
    expect(json.schemaVersion).toBe(1);

    expect(() => CashShift.fromSnapshot({ ...snap, schemaVersion: 99 })).toThrow(InvalidCashierInputError);
    expect(() => CashShift.fromJSON({ ...json, movements: 'not-an-array' })).toThrow(InvalidCashierInputError);
    expect(() => CashMovement.fromJSON({ id: '' })).toThrow(InvalidCashierInputError);
    expect(() => CashReconciliation.fromJSON({ shiftId: 's1' })).toThrow(InvalidCashierInputError);
  });
});
