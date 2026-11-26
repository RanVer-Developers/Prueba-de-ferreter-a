import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildEscPosQrCodeBytes,
  CashRegister,
  CloseShiftUseCase,
  AuditCountUseCase,
  EscPosTicketFormatter,
  ExpenseCategory,
  FeatureDisabledError,
  GenerateAuditReportUseCase,
  getCurrencyDenominationPreset,
  HandoverShiftUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  OpenDrawerNoSaleUseCase,
  OpenShiftUseCase,
  PaymentMethod,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  RecordRefundUseCase,
} from '../src/index.js';

describe('@modulos/core-cashier: Enforcement of remaining 11 Feature Flags', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  const cashier = { id: 'usr-1', name: 'Ana', role: 'CASHIER' };
  const incoming = { id: 'usr-2', name: 'Luis', role: 'CASHIER' };
  const supervisor = { id: 'sup-1', name: 'Carlos', role: 'SUPERVISOR' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();
    await registerRepo.save(new CashRegister({ id: 'reg-1', name: 'Caja 1', currency: 'MXN' }));
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    await openUseCase.execute({
      shiftId: 'shift-1',
      cashRegisterId: 'reg-1',
      cashier,
      initialAmount: 500,
    });
  });

  it('blocks safeDrops and categorizedExpenses when disabled in RecordMovementUseCase', async () => {
    const useCase = new RecordMovementUseCase(shiftRepo, undefined, {
      features: { safeDrops: false, categorizedExpenses: false },
    });

    await expect(
      useCase.execute({
        movementId: 'mov-sd',
        shiftId: 'shift-1',
        type: MovementType.SAFE_DROP,
        amount: 100,
        concept: 'Retiro a bóveda',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      useCase.execute({
        movementId: 'mov-exp',
        shiftId: 'shift-1',
        type: MovementType.MANUAL_WITHDRAWAL,
        amount: 50,
        concept: 'Papelería',
        expenseCategory: ExpenseCategory.STORE_SUPPLIES,
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    // Basic uncategorized withdrawal still works even when categorizedExpenses is disabled
    const plainWithdrawal = await useCase.execute({
      movementId: 'mov-plain',
      shiftId: 'shift-1',
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: 25,
      concept: 'Retiro simple',
      performedBy: cashier,
    });
    expect(plainWithdrawal.amount.toDecimal()).toBe(25);
  });

  it('blocks linkedRefunds when disabled in RecordRefundUseCase', async () => {
    const payUseCase = new RecordPaymentUseCase(shiftRepo);
    await payUseCase.execute({
      shiftId: 'shift-1',
      transactionReference: 'SALE-1',
      ticketTotal: 100,
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 100 }],
      performedBy: cashier,
    });

    const disabledRefund = new RecordRefundUseCase(shiftRepo, undefined, {
      features: { linkedRefunds: false },
    });

    await expect(
      disabledRefund.execute({
        movementId: 'ref-1',
        shiftId: 'shift-1',
        amount: 20,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Devolución ligada',
        referenceId: 'SALE-1',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    // Unlinked refund works when linkedRefunds is false
    const unlinked = await disabledRefund.execute({
      movementId: 'ref-2',
      shiftId: 'shift-1',
      amount: 20,
      paymentMethod: PaymentMethod.CASH,
      concept: 'Devolución general',
      performedBy: cashier,
    });
    expect(unlinked.amount.toDecimal()).toBe(20);
  });

  it('blocks blindCounts and supervisorSignatures in AuditCountUseCase', async () => {
    const blindBlocked = new AuditCountUseCase(shiftRepo, undefined, {
      features: { blindCounts: false },
    });
    await expect(
      blindBlocked.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 500,
        isBlindCount: true,
      })
    ).rejects.toThrow(FeatureDisabledError);

    const sigBlocked = new AuditCountUseCase(shiftRepo, undefined, {
      features: { supervisorSignatures: false },
    });
    await expect(
      sigBlocked.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 500,
        supervisor,
        signatureToken: 'sig-123',
      })
    ).rejects.toThrow(FeatureDisabledError);
  });

  it('blocks blindCounts, supervisorSignatures, and tolerancePolicies in CloseShiftUseCase', async () => {
    const blindBlocked = new CloseShiftUseCase(registerRepo, shiftRepo, undefined, {
      features: { blindCounts: false },
    });
    await expect(
      blindBlocked.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 500,
        isBlindCount: true,
      })
    ).rejects.toThrow(FeatureDisabledError);

    const sigBlocked = new CloseShiftUseCase(registerRepo, shiftRepo, undefined, {
      features: { supervisorSignatures: false },
    });
    await expect(
      sigBlocked.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 500,
        supervisor,
        signatureToken: 'sig-123',
      })
    ).rejects.toThrow(FeatureDisabledError);

    const toleranceBlocked = new CloseShiftUseCase(registerRepo, shiftRepo, undefined, {
      discrepancyTolerance: 10,
      features: { tolerancePolicies: false },
    });
    await expect(
      toleranceBlocked.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 500,
      })
    ).rejects.toThrow(FeatureDisabledError);
  });

  it('blocks handovers and supervisorSignatures in HandoverShiftUseCase', async () => {
    const handoverBlocked = new HandoverShiftUseCase(shiftRepo, undefined, {
      features: { handovers: false },
    });
    await expect(
      handoverBlocked.execute({
        shiftId: 'shift-1',
        incomingCashier: incoming,
        declaredCashAmount: 500,
      })
    ).rejects.toThrow(FeatureDisabledError);

    const sigBlocked = new HandoverShiftUseCase(shiftRepo, undefined, {
      features: { supervisorSignatures: false },
    });
    await expect(
      sigBlocked.execute({
        shiftId: 'shift-1',
        incomingCashier: incoming,
        declaredCashAmount: 500,
        supervisor,
        signatureToken: 'sig-handover',
      })
    ).rejects.toThrow(FeatureDisabledError);
  });

  it('blocks openDrawerNoSale in OpenDrawerNoSaleUseCase', async () => {
    const blocked = new OpenDrawerNoSaleUseCase(shiftRepo, undefined, {
      features: { openDrawerNoSale: false },
    });
    await expect(
      blocked.execute({
        shiftId: 'shift-1',
        reason: 'Cambio de billetes',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);
  });

  it('blocks escPosPrinting, escPosQrCodes, and denominationPresets when disabled', async () => {
    const formatter = new EscPosTicketFormatter({
      features: { escPosPrinting: false },
    });

    expect(() => formatter.getOpenDrawerCommand()).toThrow(FeatureDisabledError);
    expect(() => formatter.getOpenDrawerCommandBytes()).toThrow(FeatureDisabledError);
    expect(() => formatter.getCutPaperCommand()).toThrow(FeatureDisabledError);
    expect(() => formatter.getCutPaperCommandBytes()).toThrow(FeatureDisabledError);

    const reportUseCase = new GenerateAuditReportUseCase(shiftRepo, registerRepo);
    const report = await reportUseCase.execute('shift-1', 'X');
    // Plain text still works when ESC/POS hardware printing is disabled
    expect(formatter.formatAuditReportPlainText(report)).toContain('Caja 1');
    expect(() => formatter.formatAuditReportEscPos(report)).toThrow(FeatureDisabledError);
    expect(() => formatter.formatAuditReportEscPosBytes(report)).toThrow(FeatureDisabledError);

    expect(() =>
      buildEscPosQrCodeBytes('https://example.com', 5, {
        features: { escPosQrCodes: false },
      })
    ).toThrow(FeatureDisabledError);

    expect(() =>
      getCurrencyDenominationPreset('MXN', {
        features: { denominationPresets: false },
      })
    ).toThrow(FeatureDisabledError);
  });
});
