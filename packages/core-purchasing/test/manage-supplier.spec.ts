import { describe, expect, it } from 'vitest';
import {
  InMemorySupplierProductRepository,
  InMemorySupplierRepository,
  PurchasingCurrencyMismatchError,
  SupplierNotFoundError,
  createSupplier,
  linkSupplierProduct,
  updateSupplier,
} from '../src/index.js';

describe('manage-supplier & link-supplier-product', () => {
  it('creates, updates, and links products to a supplier', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const supplierProductRepository = new InMemorySupplierProductRepository();

    const supplier = await createSupplier(
      {
        code: 'PROV-01',
        name: 'Distribuidora del Norte',
        paymentTerms: 'CREDIT',
        creditDays: 30,
        creditLimitCents: 500_000,
      },
      { supplierRepository },
    );

    expect(supplier.schemaVersion).toBe(1);
    expect(supplier.status).toBe('ACTIVE');
    expect(supplier.creditDays).toBe(30);

    const updated = await updateSupplier(
      { supplierId: supplier.id, phone: '555-1234', status: 'INACTIVE' },
      { supplierRepository },
    );
    expect(updated.status).toBe('INACTIVE');
    expect(updated.phone).toBe('555-1234');

    const link = await linkSupplierProduct(
      {
        supplierId: supplier.id,
        productId: 'prod-1',
        supplierSku: 'SUP-SKU-1',
        purchaseUom: 'BOX',
        packSize: 12,
        lastUnitCostCents: 120_00,
        isPreferred: true,
      },
      { supplierRepository, supplierProductRepository },
    );

    expect(link.packSize).toBe(12);
    expect(link.lastUnitCostCents).toBe(120_00);
  });

  it('throws SupplierNotFoundError and PurchasingCurrencyMismatchError when invalid', async () => {
    const supplierRepository = new InMemorySupplierRepository();
    const supplierProductRepository = new InMemorySupplierProductRepository();

    await expect(
      updateSupplier({ supplierId: 'missing' }, { supplierRepository }),
    ).rejects.toThrow(SupplierNotFoundError);

    const supplier = await createSupplier(
      { name: 'MX Supplier', currency: 'MXN' },
      { supplierRepository },
    );

    await expect(
      linkSupplierProduct(
        {
          supplierId: supplier.id,
          productId: 'prod-1',
          lastUnitCostCents: 1000,
          currency: 'USD',
        },
        { supplierRepository, supplierProductRepository },
      ),
    ).rejects.toThrow(PurchasingCurrencyMismatchError);
  });
});
