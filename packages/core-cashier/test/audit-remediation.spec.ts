import { describe, expect, it } from 'vitest';
import {
  CashRegister,
  ConcurrencyError,
  FeatureDisabledError,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InsufficientRoleError,
  InvalidMoneyAmountError,
  Money,
  OpenShiftUseCase,
  PayOutTipsUseCase,
  PaymentMethod,
  RecordPaymentUseCase,
  SupervisorAuthorizationPolicy,
  VoidPaymentUseCase,
} from '../src/index.js';

describe('@modulos/core-cashier Audit Remediation Tests', () => {
  const cashier = { id: 'usr-1', name: 'Cajero', role: 'CASHIER' };
  const supervisor = { id: 'sup-1', name: 'Supervisor', role: 'SUPERVISOR' };

  it('defaults InMemoryCashShiftRepository to isolate: true and enforces optimistic concurrency', async () => {
    const regRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();
    await regRepo.save(new CashRegister({ id: 'r1', name: 'Caja 1', currency: 'USD' }));

    await new OpenShiftUseCase(regRepo, shiftRepo).execute({
      shiftId: 's1',
      cashRegisterId: 'r1',
      cashier,
      initialAmount: 100,
    });

    const staleCopy = (await shiftRepo.findById('s1'))!;
    await new RecordPaymentUseCase(shiftRepo).execute({
      shiftId: 's1',
      transactionReference: 'TK-CONC',
      ticketTotal: 10,
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 10 }],
      tenderedCash: 10,
      performedBy: cashier,
    });

    await expect(shiftRepo.save(staleCopy)).rejects.toThrow(ConcurrencyError);
  });

  it('requires explicit role in SupervisorAuthorizationPolicy by default', () => {
    const policy = new SupervisorAuthorizationPolicy();
    expect(() =>
      policy.assertCanAuthorize('VOID', { id: 'sup-norole', name: 'Sin Rol' }, cashier)
    ).toThrow(InsufficientRoleError);

    expect(() =>
      policy.assertCanAuthorize('VOID', supervisor, cashier)
    ).not.toThrow();
  });

  it('rejects voiding when voidTransactions feature is disabled and validates returnedBreakdownCounts', async () => {
    const regRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();
    await regRepo.save(new CashRegister({ id: 'r1', name: 'Caja 1', currency: 'USD' }));
    await new OpenShiftUseCase(regRepo, shiftRepo).execute({
      shiftId: 's1',
      cashRegisterId: 'r1',
      cashier,
      initialAmount: 100,
    });
    const payRes = await new RecordPaymentUseCase(shiftRepo).execute({
      shiftId: 's1',
      transactionReference: 'TK-1',
      ticketTotal: 50,
      payments: [{ id: 'p1', method: PaymentMethod.CASH, amount: 50 }],
      tenderedCash: 50,
      performedBy: cashier,
    });
    const movementId = payRes.movements[0]!.id;

    const disabledVoid = new VoidPaymentUseCase(shiftRepo, undefined, {
      features: { voidTransactions: false },
    });
    await expect(
      disabledVoid.execute({
        shiftId: 's1',
        movementIdToVoid: movementId,
        reason: 'Error',
        authorizedBy: supervisor,
      })
    ).rejects.toThrow(FeatureDisabledError);

    const enabledVoid = new VoidPaymentUseCase(shiftRepo);
    await expect(
      enabledVoid.execute({
        shiftId: 's1',
        movementIdToVoid: movementId,
        reason: 'Desglose incorrecto',
        authorizedBy: supervisor,
        returnedBreakdownCounts: { 10: 1 },
      })
    ).rejects.toThrow(InvalidMoneyAmountError);
  });

  it('protects unassigned tip pool when serverEmployeeId is omitted in PayOutTipsUseCase', async () => {
    const regRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();
    await regRepo.save(new CashRegister({ id: 'r1', name: 'Caja 1', currency: 'USD' }));
    await new OpenShiftUseCase(regRepo, shiftRepo).execute({
      shiftId: 's1',
      cashRegisterId: 'r1',
      cashier,
      initialAmount: 200,
    });
    await new RecordPaymentUseCase(shiftRepo).execute({
      shiftId: 's1',
      transactionReference: 'TK-TIP',
      ticketTotal: 100,
      payments: [{ id: 'p-tip', method: PaymentMethod.CASH, amount: 100 }],
      tip: {
        id: 'tip-1',
        amount: 20,
        paymentMethod: PaymentMethod.CASH,
        serverEmployeeId: 'waiter-1',
        serverName: 'Mesero 1',
      },
      tenderedCash: 120,
      performedBy: cashier,
    });

    const payout = new PayOutTipsUseCase(shiftRepo);
    await expect(
      payout.execute({
        movementId: 'tip-out-1',
        shiftId: 's1',
        amount: 10,
        performedBy: cashier,
      })
    ).rejects.toThrow(InvalidMoneyAmountError);
  });

  it('rejects invalid ISO 4217 currency codes via @modulos/core-shared', () => {
    expect(() => Money.fromDecimal(10, 'US')).toThrow(InvalidMoneyAmountError);
  });
});
