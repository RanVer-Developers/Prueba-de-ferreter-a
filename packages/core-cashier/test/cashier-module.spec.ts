import { describe, expect, it } from 'vitest';
import { FeatureDisabledError, PaymentMethod, createCashierModule } from '../src/index.js';

describe('createCashierModule facade', () => {
  it('wires register/shift repositories, runs shift payment flow, and propagates feature flags', async () => {
    const mod = createCashierModule({ featureProfile: 'BASIC' });
    const cashier = { id: 'u-1', name: 'Ana', role: 'CASHIER' };

    const reg = await mod.createRegister({ id: 'reg-1', name: 'Caja 1', currency: 'MXN' });
    await mod.openShift({
      shiftId: 'sh-1',
      cashRegisterId: reg.id,
      cashier,
      initialAmount: 500,
    });

    await mod.recordPayment({
      shiftId: 'sh-1',
      transactionReference: 'ord-1',
      payments: [{ id: 'pay-1', method: PaymentMethod.CASH, amount: 150 }],
      performedBy: cashier,
    });

    const summaryRes = await mod.getShiftSummary('sh-1');
    expect(summaryRes.summary.currentCashInDrawer.toDecimal()).toBe(650);

    await expect(
      mod.openDrawerNoSale({
        shiftId: 'sh-1',
        reason: 'Cambio',
        performedBy: cashier,
      })
    ).rejects.toThrow(FeatureDisabledError);
  });
});
