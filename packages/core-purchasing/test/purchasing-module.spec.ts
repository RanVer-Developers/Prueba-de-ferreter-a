import { describe, expect, it } from 'vitest';
import { InvalidPurchasingInputError, createPurchasingModule } from '../src/index.js';

describe('createPurchasingModule facade', () => {
  it('wires supplier, purchase order, and payable workflows with default in-memory repos', async () => {
    const mod = createPurchasingModule({ featureProfile: 'INTERMEDIATE' });
    const supplier = await mod.createSupplier({
      code: 'SUP-01',
      name: 'Aceros del Norte',
      paymentTerms: 'CREDIT',
      creditDays: 30,
      creditLimitCents: 500_000,
    });
    const po = await mod.createPurchaseOrder({
      supplierId: supplier.id,
      warehouseId: 'wh-1',
      lines: [{ productId: 'prod-1', description: 'Varilla 3/8', orderedQuantity: 10, unitCostCents: 5000 }],
    });
    const approved = await mod.approvePurchaseOrder({ purchaseOrderId: po.id, approvedBy: 'mgr-1' });
    expect(approved.status).toBe('APPROVED');
  });

  it('rejects CREDIT supplier without positive creditLimitCents or unlimitedCredit: true', async () => {
    const mod = createPurchasingModule({ featureProfile: 'ADVANCED' });
    await expect(
      mod.createSupplier({
        code: 'SUP-BAD',
        name: 'Sin Limite',
        paymentTerms: 'CREDIT',
        creditDays: 15,
      })
    ).rejects.toThrow(InvalidPurchasingInputError);

    const cashSup = await mod.createSupplier({
      code: 'SUP-CASH',
      name: 'Contado SA',
      paymentTerms: 'CASH',
    });
    expect(cashSup.creditLimitCents).toBe(0);
    expect(cashSup.unlimitedCredit).toBe(false);
  });

  it('allows receiving on credit under enforceCreditLimit when unlimitedCredit: true is set', async () => {
    const mod = createPurchasingModule({ featureProfile: 'ADVANCED' });
    const supplier = await mod.createSupplier({
      code: 'SUP-UNL',
      name: 'Mayorista Nacional',
      paymentTerms: 'CREDIT',
      creditDays: 30,
      unlimitedCredit: true,
    });
    const po = await mod.createPurchaseOrder({
      supplierId: supplier.id,
      warehouseId: 'wh-1',
      lines: [{ productId: 'prod-1', description: 'Cemento', orderedQuantity: 10, unitCostCents: 25_000 }],
    });
    await mod.approvePurchaseOrder({ purchaseOrderId: po.id, approvedBy: 'mgr-1' });
    await mod.sendPurchaseOrder({ purchaseOrderId: po.id });
    const received = await mod.receivePurchase({
      purchaseOrderId: po.id,
      supplierId: supplier.id,
      warehouseId: 'wh-1',
      lines: [{ productId: 'prod-1', description: 'Cemento', acceptedQuantity: 10, unitCostCents: 25_000 }],
    });
    expect(received.receipt.totalCents).toBe(250_000);
    expect(received.payable?.balanceCents).toBe(250_000);
  });
});
