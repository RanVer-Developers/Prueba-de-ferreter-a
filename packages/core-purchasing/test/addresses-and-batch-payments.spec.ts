import { describe, expect, it } from 'vitest';
import {
  InMemoryPurchaseReceiptRepository,
  InMemorySupplierPayableRepository,
  InMemorySupplierRepository,
  allocateMultiDocumentSupplierPayment,
  createSupplier,
  receivePurchase,
  removeSupplierAddress,
  upsertSupplierAddress,
  type IPurchasingClock,
} from '../src/index.js';

function createClock(iso: string): IPurchasingClock {
  return { now: () => new Date(iso) };
}

describe('@modulos/core-purchasing supplier addresses and multi-doc payments', () => {
  it('manages multiple supplier addresses with single default invariant', async () => {
    const supplierRepo = new InMemorySupplierRepository();
    const clock = createClock('2026-09-01T10:00:00.000Z');

    const supplier = await createSupplier(
      {
        id: 'sup-1',
        name: 'Aceros del Bajío',
        paymentTerms: 'CREDIT',
        creditDays: 30,
        creditLimitCents: 1_000_000,
      },
      { supplierRepository: supplierRepo, clock },
    );

    const with1 = await upsertSupplierAddress(
      {
        supplierId: supplier.id,
        addressId: 'addr-1',
        kind: 'BILLING',
        label: 'Matriz Fiscal',
        line1: 'Av. Industrial 500',
        city: 'León',
        postalCode: '37000',
      },
      { supplierRepository: supplierRepo, clock },
    );
    expect(with1.addresses).toHaveLength(1);
    expect(with1.addresses[0]?.isDefault).toBe(true);

    const with2 = await upsertSupplierAddress(
      {
        supplierId: supplier.id,
        addressId: 'addr-2',
        kind: 'WAREHOUSE',
        label: 'Bodega Norte',
        line1: 'Carr. Panamericana Km 12',
        city: 'León',
        postalCode: '37200',
        isDefault: true,
      },
      { supplierRepository: supplierRepo, clock },
    );
    expect(with2.addresses).toHaveLength(2);
    expect(with2.addresses.find((a) => a.id === 'addr-1')?.isDefault).toBe(false);
    expect(with2.addresses.find((a) => a.id === 'addr-2')?.isDefault).toBe(true);

    const afterRemove = await removeSupplierAddress(supplier.id, 'addr-2', {
      supplierRepository: supplierRepo,
      clock,
    });
    expect(afterRemove.addresses).toHaveLength(1);
    expect(afterRemove.addresses[0]?.isDefault).toBe(true);
  });

  it('allocates a single payment across multiple open supplier payables in FIFO due-date order', async () => {
    const supplierRepo = new InMemorySupplierRepository();
    const receiptRepo = new InMemoryPurchaseReceiptRepository();
    const payableRepo = new InMemorySupplierPayableRepository();

    await createSupplier(
      {
        id: 'sup-2',
        name: 'Cementos del Pacífico',
        paymentTerms: 'CREDIT',
        creditDays: 15,
        creditLimitCents: 5_000_000,
      },
      { supplierRepository: supplierRepo, clock: createClock('2026-09-01T10:00:00.000Z') },
    );

    const rec1 = await receivePurchase(
      {
        supplierId: 'sup-2',
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-A1',
        lines: [{ productId: 'p1', description: 'Cemento', acceptedQuantity: 10, unitCostCents: 10_000 }],
      },
      {
        supplierRepository: supplierRepo,
        purchaseReceiptRepository: receiptRepo,
        supplierPayableRepository: payableRepo,
        clock: createClock('2026-09-01T10:00:00.000Z'),
      },
    );

    const rec2 = await receivePurchase(
      {
        supplierId: 'sup-2',
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-A2',
        lines: [{ productId: 'p1', description: 'Cemento', acceptedQuantity: 10, unitCostCents: 15_000 }],
      },
      {
        supplierRepository: supplierRepo,
        purchaseReceiptRepository: receiptRepo,
        supplierPayableRepository: payableRepo,
        clock: createClock('2026-09-05T10:00:00.000Z'),
      },
    );

    expect(rec1.payable?.originalAmountCents).toBe(100_000);
    expect(rec2.payable?.originalAmountCents).toBe(150_000);

    const batch = await allocateMultiDocumentSupplierPayment(
      {
        supplierId: 'sup-2',
        totalAmountCents: 180_000,
        paymentMethod: 'TRANSFER',
        paidBy: 'cxc-1',
      },
      { supplierPayableRepository: payableRepo, clock: createClock('2026-09-10T10:00:00.000Z') },
    );

    expect(batch.allocations).toEqual([
      { payableId: rec1.payable!.id, appliedCents: 100_000, remainingBalanceCents: 0 },
      { payableId: rec2.payable!.id, appliedCents: 80_000, remainingBalanceCents: 70_000 },
    ]);
    expect(batch.updatedPayables[0]?.status).toBe('PAID');
    expect(batch.updatedPayables[1]?.status).toBe('PARTIAL');
  });
});
