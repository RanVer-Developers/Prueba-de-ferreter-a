import { describe, expect, it } from 'vitest';
import {
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseReceiptRepository,
  InMemorySupplierPayableRepository,
  InMemorySupplierRepository,
  InMemorySupplierReturnRepository,
  InvalidPaymentAmountError,
  createSupplier,
  receivePurchase,
  recordSupplierPayment,
  recordSupplierReturn,
  type InventoryReturnPortInput,
} from '../src/index.js';

describe('supplier payables & supplier returns', () => {
  it('creates payable on credit receipt and tracks partial/full payments', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();
    const purchaseReceiptRepository = new InMemoryPurchaseReceiptRepository();
    const supplierPayableRepository = new InMemorySupplierPayableRepository();

    const supplier = await createSupplier(
      {
        name: 'Proveedor Credito',
        paymentTerms: 'CREDIT',
        creditDays: 30,
        creditLimitCents: 100_000,
      },
      { supplierRepository },
    );

    const { payable } = await receivePurchase(
      {
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-CRED-1',
        lines: [
          {
            productId: 'prod-1',
            description: 'Producto A',
            acceptedQuantity: 10,
            unitCostCents: 1000,
            taxRateBps: 0,
          },
        ],
      },
      {
        supplierRepository,
        purchaseOrderRepository,
        purchaseReceiptRepository,
        supplierPayableRepository,
        featureProfile: 'INTERMEDIATE',
      },
    );

    expect(payable).not.toBeNull();
    expect(payable?.status).toBe('OPEN');
    expect(payable?.balanceCents).toBe(10_000);

    const afterPartial = await recordSupplierPayment(
      {
        payableId: payable!.id,
        amountCents: 4_000,
        paymentMethod: 'TRANSFER',
        reference: 'SPEI-01',
      },
      { supplierPayableRepository },
    );
    expect(afterPartial.status).toBe('PARTIAL');
    expect(afterPartial.balanceCents).toBe(6_000);

    await expect(
      recordSupplierPayment(
        {
          payableId: payable!.id,
          amountCents: 7_000,
          paymentMethod: 'TRANSFER',
        },
        { supplierPayableRepository },
      ),
    ).rejects.toThrow(InvalidPaymentAmountError);

    const afterFull = await recordSupplierPayment(
      {
        payableId: payable!.id,
        amountCents: 6_000,
        paymentMethod: 'TRANSFER',
      },
      { supplierPayableRepository },
    );
    expect(afterFull.status).toBe('PAID');
    expect(afterFull.balanceCents).toBe(0);
    expect(afterFull.payments).toHaveLength(2);
  });

  it('records supplier return and forwards stock deduction to inventory port', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const supplierReturnRepository = new InMemorySupplierReturnRepository();
    const returnCalls: InventoryReturnPortInput[] = [];

    const supplier = await createSupplier({ name: 'Proveedor Retorno' }, { supplierRepository });

    const ret = await recordSupplierReturn(
      {
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        lines: [
          {
            productId: 'prod-1',
            quantity: 3,
            unitCostCents: 500,
            reason: 'Damaged packaging',
          },
        ],
      },
      {
        supplierRepository,
        supplierReturnRepository,
        inventoryReturnPort: {
          recordSupplierReturnStock: async (input) => {
            returnCalls.push(input);
          },
        },
      },
    );

    expect(ret.totalCents).toBe(1500);
    expect(returnCalls).toHaveLength(1);
    expect(returnCalls[0]?.lines[0]?.quantity).toBe(3);
  });
});
