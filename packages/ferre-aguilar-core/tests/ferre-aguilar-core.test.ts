import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '@modulos/core-cashier';
import { InventoryItem } from '@modulos/core-inventory';
import { Money } from '@modulos/core-shared';
import {
  FERRE_AGUILAR_ROLES,
  createFerreAguilarCore,
  resolveFerreAguilarFeatures,
  roleHasPermission,
} from '../src/index.js';

describe('@ferre-aguilar/core', () => {
  it('resolves the approved feature-flag contract for Ferre Aguilar', () => {
    const flags = resolveFerreAguilarFeatures();

    expect(flags.settings.multiBranch).toBe(false);
    expect(flags.settings.auditTrail).toBe(true);

    expect(flags.authRbac.pinAuth).toBe(true);
    expect(flags.authRbac.granularPermissions).toBe(true);
    expect(flags.authRbac.supervisorOverride).toBe(true);
    expect(flags.authRbac.auditTrail).toBe(true);

    expect(flags.catalog.multiBarcodeLookup).toBe(true);
    expect(flags.catalog.priceLists).toBe(true);
    expect(flags.catalog.modifiersAndAddons).toBe(false);

    expect(flags.inventory.multiWarehouse).toBe(false);
    expect(flags.inventory.negativeStock).toBe(false);
    expect(flags.inventory.receivingOrders).toBe(true);
    expect(flags.inventory.replenishmentSuggestions).toBe(true);
    expect(flags.inventory.abcClassification).toBe(true);

    expect(flags.purchasing.allowOverReceiving).toBe(false);
    expect(flags.purchasing.autoUpdateCatalogCost).toBe(true);
    expect(flags.purchasing.accountsPayable).toBe(true);

    expect(flags.orders.fractionalQuantities).toBe(true);
    expect(flags.orders.parkedOrders).toBe(true);
    expect(flags.orders.quotes).toBe(true);

    expect(flags.cashier.tips).toBe(false);
    expect(flags.cashier.openDrawerNoSale).toBe(true);
    expect(flags.cashier.supervisorSignatures).toBe(true);

    expect(flags.logistics.requireProofOfDelivery).toBe(true);
    expect(flags.logistics.enforceDriverCapacity).toBe(true);

    expect(flags.services.partsConsumption).toBe(true);
    expect(flags.services.billingIntegration).toBe(false);

    expect(flags.reports.profitabilityMetrics).toBe(true);
    expect(flags.reports.abcParetoAnalytics).toBe(true);
    expect(flags.reports.dataExport).toBe(true);
  });

  it('bootstraps the 6 Ferre Aguilar roles and enforces anti-theft permissions', async () => {
    const core = createFerreAguilarCore();
    const roles = await core.bootstrapDefaultRoles();

    expect(roles.map((r) => r.code)).toEqual([
      FERRE_AGUILAR_ROLES.OWNER,
      FERRE_AGUILAR_ROLES.MANAGER,
      FERRE_AGUILAR_ROLES.CASHIER,
      FERRE_AGUILAR_ROLES.SELLER,
      FERRE_AGUILAR_ROLES.WAREHOUSE,
      FERRE_AGUILAR_ROLES.DRIVER,
    ]);

    const ownerUser = await core.registerStaffMember({
      username: 'alfredo.dueno',
      displayName: 'Alfredo Aguilar',
      pin: '1001',
      roleCode: FERRE_AGUILAR_ROLES.OWNER,
    });
    const sellerUser = await core.registerStaffMember({
      username: 'carlos.vendedor',
      displayName: 'Carlos Vendedor',
      pin: '2002',
      roleCode: FERRE_AGUILAR_ROLES.SELLER,
    });
    const driverUser = await core.registerStaffMember({
      username: 'luis.chofer',
      displayName: 'Luis Chofer',
      pin: '3003',
      roleCode: FERRE_AGUILAR_ROLES.DRIVER,
    });

    await expect(
      core.authRbac.assertPermission({
        userId: ownerUser.id,
        permission: 'cashier:void',
      })
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      core.authRbac.assertPermission({
        userId: sellerUser.id,
        permission: 'cashier:void',
      })
    ).rejects.toThrow();

    await expect(
      core.authRbac.assertPermission({
        userId: driverUser.id,
        permission: 'logistics:deliver',
      })
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      core.authRbac.assertPermission({
        userId: driverUser.id,
        permission: 'reports:financial',
      })
    ).rejects.toThrow();
  });

  it('orchestrates counter sale, stock deduction and cashier payment with exact cents', async () => {
    const core = createFerreAguilarCore();
    await core.bootstrapDefaultRoles();

    const warehouse = await core.ensureMainWarehouse('Almacén Principal Ferre Aguilar');
    const item = new InventoryItem({
      id: 'MART-001',
      sku: 'MART-001',
      name: 'Martillo de uña 16oz',
    });
    await core.inventory.repositories.itemRepo.save(item);

    await core.inventory.recordStockIn({
      itemId: 'MART-001',
      warehouseId: warehouse.id,
      quantity: 10,
      unitCost: { amount: 12000, currency: 'MXN' },
      performedBy: { id: 'bodega-1', name: 'Bodeguero', role: 'WAREHOUSE' },
    });

    const register = await core.cashier.createRegister({
      id: 'reg-mostrador-1',
      name: 'Caja Mostrador 1',
      branchId: 'main-store',
    });
    const shift = await core.cashier.openShift({
      shiftId: 'shift-001',
      cashRegisterId: register.id,
      cashier: { id: 'cajera-1', name: 'Cajera 1', role: 'CASHIER' },
      initialAmount: 500,
    });

    const saleResult = await core.recordCounterSale({
      shiftId: shift.id,
      warehouseId: warehouse.id,
      cashierId: 'cajera-1',
      idempotencyKey: 'sale-001',
      items: [
        {
          sku: 'MART-001',
          name: 'Martillo de uña 16oz',
          quantity: 2,
          unitPriceCents: 18500,
        },
      ],
      paymentMethod: PaymentMethod.CASH,
      tenderedCents: 40000,
    });

    expect(saleResult.total.toCents()).toBe(37000);
    expect(saleResult.change.toCents()).toBe(3000);

    const stock = await core.inventory.getStockAvailability({
      itemId: 'MART-001',
      warehouseId: warehouse.id,
    });
    expect(stock.totalAvailable).toBe(8);

    await expect(
      core.recordCounterSale({
        shiftId: shift.id,
        warehouseId: warehouse.id,
        cashierId: 'cajera-1',
        idempotencyKey: 'sale-002',
        items: [
          {
            sku: 'MART-001',
            name: 'Martillo de uña 16oz',
            quantity: 20,
            unitPriceCents: 18500,
          },
        ],
        paymentMethod: PaymentMethod.CASH,
        tenderedCents: Money.fromCents(400000).toCents(),
      })
    ).rejects.toThrow();
  });

  it('orchestrates delivery shipments and unit maintenance orders', async () => {
    const core = createFerreAguilarCore();

    const driver = await core.registerFleetDriver({
      name: 'Camioneta Ford F-350 — Luis',
      vehicleType: 'VAN',
      plateNumber: 'GTO-458-A',
      maxWeightKg: 1500,
    });

    const shipment = await core.createAndAssignDelivery({
      orderId: 'ORD-1001',
      driverId: driver.id,
      recipientName: 'Constructora Bajío',
      street: 'Av. Tecnológico 410',
      city: 'León',
      postalCode: '37000',
      zone: 'CENTRO',
      weightKg: 120,
      orderTotalCents: 250000,
    });

    expect(shipment.status).toBe('ASSIGNED');
    expect(shipment.driverId).toBe(driver.id);

    const maintenance = await core.createFleetMaintenanceOrder({
      unitPlate: 'GTO-458-A',
      driverName: 'Luis Chofer',
      issueDescription: 'Cambio de balatas delanteras y afinación 40,000 km',
      parts: [
        {
          sku: 'REF-BAL-01',
          name: 'Juego de balatas cerámicas',
          quantity: 1,
          unitCostCents: 85000,
        },
      ],
    });

    expect(maintenance.status).toBe('IN_PROGRESS');
    expect(maintenance.partLines.length).toBe(1);
    expect(maintenance.partsSubtotalCents).toBe(85000);
  });

  it('roleHasPermission follows the anti-theft matrix', () => {
    expect(roleHasPermission('OWNER', 'sales:cancel')).toBe(true);
    expect(roleHasPermission('CASHIER', 'sales:cancel')).toBe(false);
    expect(roleHasPermission('DRIVER', 'cashier:charge')).toBe(false);
  });
});
