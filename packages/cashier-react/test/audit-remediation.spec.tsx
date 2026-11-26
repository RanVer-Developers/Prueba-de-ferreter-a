// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  CashierOptions,
  CashierProvider,
  CashRegister,
  ExpenseCategory,
  FeatureDisabledError,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  PaymentMethod,
  useCashier,
} from '../src/index.js';

describe('@modulos/cashier-react Audit Remediation Tests', () => {
  const cashier = { id: 'usr-react', name: 'Ana', role: 'CASHIER' };
  const incoming = { id: 'usr-react-2', name: 'Luis', role: 'CASHIER' };
  const supervisor = { id: 'sup-react', name: 'Carlos', role: 'SUPERVISOR' };

  const createWrapper = (options?: CashierOptions) => {
    const registerRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();
    registerRepo.save(new CashRegister({ id: 'reg-1', name: 'Caja React', currency: 'USD' }));

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <CashierProvider
        registerRepo={registerRepo}
        shiftRepo={shiftRepo}
        defaultRegisterId="reg-1"
        options={options}
      >
        {children}
      </CashierProvider>
    );
    return { Wrapper };
  };

  it('forwards features profile to voidTransaction and forwards cashRounding on recordPayment', async () => {
    const { Wrapper } = createWrapper({
      features: { voidTransactions: false, multiCurrency: true, cashRounding: true },
    });
    const { result, unmount } = renderHook(() => useCashier(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.openShift({
        shiftId: 's-react-1',
        cashier,
        initialAmount: 100,
      });
    });

    await act(async () => {
      const payRes = await result.current.recordPayment({
        transactionReference: 'TK-1',
        ticketTotal: 10.02,
        payments: [{ id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 5 }],
        tenderedCash: 5,
        cashRounding: { increment: 0.05, mode: 'HALF_UP' },
        performedBy: cashier,
      });
      expect(payRes.roundingAdjustment?.toCents()).toBe(-2);
    });

    await expect(
      result.current.voidTransaction({
        transactionReference: 'TK-1',
        reason: 'Void blocked by feature flag',
        authorizedBy: supervisor,
      })
    ).rejects.toThrow(FeatureDisabledError);

    unmount();
  });

  it('forwards options.features to recordMovement, recordRefund, auditCount, closeShift, handoverShift, and openDrawerNoSale', async () => {
    const { Wrapper } = createWrapper({
      discrepancyTolerance: 5,
      features: {
        safeDrops: false,
        categorizedExpenses: false,
        linkedRefunds: false,
        blindCounts: false,
        handovers: false,
        openDrawerNoSale: false,
        tolerancePolicies: false,
      },
    });
    const { result, unmount } = renderHook(() => useCashier(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.openShift({
        shiftId: 's-react-flags',
        cashier,
        initialAmount: 100,
      });
    });

    await expect(
      result.current.recordMovement({
        type: MovementType.MANUAL_WITHDRAWAL,
        amount: 10,
        concept: 'Compra',
        expenseCategory: ExpenseCategory.STORE_SUPPLIES,
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.safeDrop({
        amount: 20,
        reason: 'Bóveda',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.recordRefund({
        amount: 10,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Refund',
        referenceId: 'SALE-99',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.auditCount({
        declaredCashAmount: 100,
        isBlindCount: true,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.handoverShift({
        incomingCashier: incoming,
        declaredCashAmount: 100,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.openDrawerNoSale({
        reason: 'Sencillo',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);

    await expect(
      result.current.closeShift({
        declaredCashAmount: 100,
      })
    ).rejects.toThrow(FeatureDisabledError);

    unmount();
  });
});
