import { describe, expect, it } from 'vitest';
import {
  InMemoryPurchaseOrderRepository,
  InMemorySupplierRepository,
  InvalidPurchaseOrderStateError,
  SupplierInactiveError,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  sendPurchaseOrder,
  updateSupplier,
} from '../src/index.js';

describe('purchase-order workflow', () => {
  it('enforces approval workflow in ADVANCED profile', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();

    const supplier = await createSupplier({ name: 'Proveedor A' }, { supplierRepository });

    const po = await createPurchaseOrder(
      {
        supplierId: supplier.id,
        warehouseId: 'wh-main',
        autoSend: true, // ignored when requirePOApproval is true
        lines: [
          {
            productId: 'prod-1',
            description: 'Refresco 600ml',
            orderedQuantity: 10,
            unitCostCents: 1500,
            taxRateBps: 1600,
          },
        ],
      },
      { supplierRepository, purchaseOrderRepository, featureProfile: 'ADVANCED' },
    );

    expect(po.status).toBe('DRAFT');
    expect(po.totalCents).toBe(17_400);

    await expect(
      sendPurchaseOrder(
        { purchaseOrderId: po.id },
        { purchaseOrderRepository, featureProfile: 'ADVANCED' },
      ),
    ).rejects.toThrow(InvalidPurchaseOrderStateError);

    const approved = await approvePurchaseOrder(
      { purchaseOrderId: po.id, approvedBy: 'admin-1' },
      { purchaseOrderRepository },
    );
    expect(approved.status).toBe('APPROVED');

    const sent = await sendPurchaseOrder(
      { purchaseOrderId: po.id },
      { purchaseOrderRepository, featureProfile: 'ADVANCED' },
    );
    expect(sent.status).toBe('SENT');

    const cancelled = await cancelPurchaseOrder(
      { purchaseOrderId: po.id, reason: 'Out of stock at supplier' },
      { purchaseOrderRepository },
    );
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('blocks creating PO for inactive supplier', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const purchaseOrderRepository = new InMemoryPurchaseOrderRepository();

    const supplier = await createSupplier({ name: 'Proveedor B' }, { supplierRepository });
    await updateSupplier(
      { supplierId: supplier.id, status: 'BLOCKED' },
      { supplierRepository },
    );

    await expect(
      createPurchaseOrder(
        {
          supplierId: supplier.id,
          warehouseId: 'wh-1',
          lines: [
            {
              productId: 'prod-1',
              description: 'Item',
              orderedQuantity: 1,
              unitCostCents: 100,
            },
          ],
        },
        { supplierRepository, purchaseOrderRepository },
      ),
    ).rejects.toThrow(SupplierInactiveError);
  });
});
