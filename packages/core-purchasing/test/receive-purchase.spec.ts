import { describe, expect, it } from 'vitest';
import {
  CreditLimitExceededError,
  DuplicateInvoiceNumberError,
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseReceiptRepository,
  InMemorySupplierPayableRepository,
  InMemorySupplierProductRepository,
  InMemorySupplierRepository,
  OverReceivingNotAllowedError,
  PurchasingFeatureDisabledError,
  createPurchaseOrder,
  createSupplier,
  linkSupplierProduct,
  receivePurchase,
  type CatalogCostUpdateInput,
  type InventoryReceivingPortInput,
} from '../src/index.js';

describe('receive-purchase use case', () => {
  it('receives partial and final deliveries against a PO, forwards stock to inventory port, and updates catalog cost', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const supplierProductRepository = new InMemorySupplierProductRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();
    const purchaseReceiptRepository = new InMemoryPurchaseReceiptRepository();

    const inventoryCalls: InventoryReceivingPortInput[] = [];
    const catalogCalls: CatalogCostUpdateInput[] = [];

    const supplier = await createSupplier({ name: 'Proveedor Central' }, { supplierRepository });
    await linkSupplierProduct(
      {
        supplierId: supplier.id,
        productId: 'prod-1',
        purchaseUom: 'BOX',
        packSize: 12,
        lastUnitCostCents: 120_00,
      },
      { supplierRepository, supplierProductRepository },
    );

    const po = await createPurchaseOrder(
      {
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        autoSend: true,
        lines: [
          {
            productId: 'prod-1',
            description: 'Leche Caja 12pz',
            purchaseUom: 'BOX',
            packSize: 12,
            orderedQuantity: 5,
            unitCostCents: 120_00,
            taxRateBps: 0,
          },
        ],
      },
      { supplierRepository, purchaseOrderRepository, featureProfile: 'INTERMEDIATE' },
    );

    // Partial receipt: 3 boxes at new cost 132_00 cents ($11.00 per unit)
    const first = await receivePurchase(
      {
        purchaseOrderId: po.id,
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-1001',
        lines: [
          {
            purchaseOrderLineId: po.lines[0]!.id,
            productId: 'prod-1',
            description: 'Leche Caja 12pz',
            purchaseUom: 'BOX',
            packSize: 12,
            acceptedQuantity: 3,
            unitCostCents: 132_00,
          },
        ],
      },
      {
        supplierRepository,
        supplierProductRepository,
        purchaseOrderRepository,
        purchaseReceiptRepository,
        inventoryReceivingPort: {
          receivePurchaseStock: async (input) => {
            inventoryCalls.push(input);
          },
        },
        catalogCostUpdaterPort: {
          updateProductCost: async (input) => {
            catalogCalls.push(input);
          },
        },
      },
    );

    expect(first.purchaseOrder?.status).toBe('PARTIALLY_RECEIVED');
    expect(inventoryCalls).toHaveLength(1);
    expect(inventoryCalls[0]?.lines[0]?.quantity).toBe(36); // 3 * 12
    expect(inventoryCalls[0]?.lines[0]?.unitCostCents).toBe(11_00); // 132_00 / 12

    expect(catalogCalls).toHaveLength(1);
    expect(catalogCalls[0]?.newUnitCostCents).toBe(11_00);

    const updatedLink = await supplierProductRepository.findBySupplierAndProduct(
      supplier.id,
      'prod-1',
    );
    expect(updatedLink?.lastUnitCostCents).toBe(132_00);

    // Prevent over-receiving (> 2 remaining)
    await expect(
      receivePurchase(
        {
          purchaseOrderId: po.id,
          supplierId: supplier.id,
          warehouseId: 'wh-1',
          invoiceNumber: 'FAC-1002',
          lines: [
            {
              purchaseOrderLineId: po.lines[0]!.id,
              productId: 'prod-1',
              description: 'Leche Caja 12pz',
              purchaseUom: 'BOX',
              packSize: 12,
              acceptedQuantity: 3,
              unitCostCents: 132_00,
            },
          ],
        },
        {
          supplierRepository,
          purchaseOrderRepository,
          purchaseReceiptRepository,
        },
      ),
    ).rejects.toThrow(OverReceivingNotAllowedError);

    // Final receipt: remaining 2 boxes
    const second = await receivePurchase(
      {
        purchaseOrderId: po.id,
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-1002',
        lines: [
          {
            purchaseOrderLineId: po.lines[0]!.id,
            productId: 'prod-1',
            description: 'Leche Caja 12pz',
            purchaseUom: 'BOX',
            packSize: 12,
            acceptedQuantity: 2,
            unitCostCents: 132_00,
          },
        ],
      },
      {
        supplierRepository,
        purchaseOrderRepository,
        purchaseReceiptRepository,
      },
    );

    expect(second.purchaseOrder?.status).toBe('RECEIVED');
  });

  it('rejects duplicate invoice numbers and direct purchases when disabled', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();
    const purchaseReceiptRepository = new InMemoryPurchaseReceiptRepository();

    const supplier = await createSupplier({ name: 'Proveedor Directo' }, { supplierRepository });

    await expect(
      receivePurchase(
        {
          supplierId: supplier.id,
          warehouseId: 'wh-1',
          invoiceNumber: 'FAC-99',
          lines: [
            {
              productId: 'prod-1',
              description: 'Item',
              acceptedQuantity: 2,
              unitCostCents: 500,
            },
          ],
        },
        {
          supplierRepository,
          purchaseOrderRepository,
          purchaseReceiptRepository,
          featureProfile: 'ADVANCED', // directPurchaseWithoutPO = false
        },
      ),
    ).rejects.toThrow(PurchasingFeatureDisabledError);

    await receivePurchase(
      {
        supplierId: supplier.id,
        warehouseId: 'wh-1',
        invoiceNumber: 'FAC-99',
        lines: [
          {
            productId: 'prod-1',
            description: 'Item',
            acceptedQuantity: 2,
            unitCostCents: 500,
          },
        ],
      },
      {
        supplierRepository,
        purchaseOrderRepository,
        purchaseReceiptRepository,
        featureProfile: 'BASIC',
      },
    );

    await expect(
      receivePurchase(
        {
          supplierId: supplier.id,
          warehouseId: 'wh-1',
          invoiceNumber: 'FAC-99',
          lines: [
            {
              productId: 'prod-1',
              description: 'Item',
              acceptedQuantity: 1,
              unitCostCents: 500,
            },
          ],
        },
        {
          supplierRepository,
          purchaseOrderRepository,
          purchaseReceiptRepository,
          featureProfile: 'BASIC',
        },
      ),
    ).rejects.toThrow(DuplicateInvoiceNumberError);
  });

  it('enforces supplier credit limit when configured', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();
    const purchaseReceiptRepository = new InMemoryPurchaseReceiptRepository();
    const supplierPayableRepository = new InMemorySupplierPayableRepository();

    const supplier = await createSupplier(
      {
        name: 'Credito Limitado',
        paymentTerms: 'CREDIT',
        creditDays: 15,
        creditLimitCents: 10_000,
      },
      { supplierRepository },
    );

    await expect(
      receivePurchase(
        {
          supplierId: supplier.id,
          warehouseId: 'wh-1',
          lines: [
            {
              productId: 'prod-1',
              description: 'Item caro',
              acceptedQuantity: 2,
              unitCostCents: 6_000, // 12_000 > 10_000
            },
          ],
        },
        {
          supplierRepository,
          purchaseOrderRepository,
          purchaseReceiptRepository,
          supplierPayableRepository,
          featureProfile: { directPurchaseWithoutPO: true, enforceCreditLimit: true },
        },
      ),
    ).rejects.toThrow(CreditLimitExceededError);
  });
});
