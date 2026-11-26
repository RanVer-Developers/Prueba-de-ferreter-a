import { describe, expect, it } from 'vitest';
import {
  AssembleProductUseCase,
  CompositeProduct,
  DispatchCompositeProductUseCase,
  FeatureDisabledError,
  GetExpiringLotsUseCase,
  GetKardexUseCase,
  InMemoryCompositeProductRepository,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InventoryItem,
  ManageLotQuarantineUseCase,
  Money,
  StockMovementType,
  ValuationService,
  Warehouse,
  assertInventoryFeatureEnabled,
  createInventoryFeatureFlags,
  resolveInventoryFeatures,
} from '../src/index.js';

describe('New Inventory Features & Use Cases', () => {
  const operator = { id: 'usr-op', name: 'Operador', role: 'WAREHOUSE_OPERATOR' };
  const supervisor = { id: 'usr-sup', name: 'Supervisor', role: 'SUPERVISOR' };

  it('debe resolver perfiles de complejidad (BASIC / INTERMEDIATE / ADVANCED) con FeatureFlags', () => {
    const basic = resolveInventoryFeatures('BASIC');
    expect(basic.multiWarehouse).toBe(false);
    expect(basic.batchLots).toBe(false);
    expect(basic.barcodeLabels).toBe(true);

    expect(() => assertInventoryFeatureEnabled(basic, 'serialNumbers')).toThrow(FeatureDisabledError);

    const custom = createInventoryFeatureFlags('BASIC', { batchLots: true });
    expect(custom.batchLots).toBe(true);
    expect(custom.fifoValuation).toBe(false);
  });

  it('debe detectar lotes por vencer y gestionar cuarentena/baja en ManageLotQuarantineUseCase', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Farmacia' }));

    const now = new Date();
    const in10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const expiredDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const item = new InventoryItem({
      id: 'med-1',
      sku: 'SKU-MED',
      name: 'Antibiótico',
      trackingType: 'BATCH_LOT',
    });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 20,
      unitCost: Money.fromDecimal(5, 'USD'),
      lotProps: {
        lotNumber: 'LOT-SOON',
        expirationDate: in10Days,
        initialQuantity: 20,
        currentQuantity: 20,
      },
      performedBy: operator,
      receivedAt: now,
    });
    item.receiveStock({
      movementId: 'm2',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: Money.fromDecimal(5, 'USD'),
      lotProps: {
        lotNumber: 'LOT-EXP',
        expirationDate: expiredDate,
        initialQuantity: 5,
        currentQuantity: 5,
        status: 'EXPIRED',
      },
      performedBy: operator,
      receivedAt: now,
    });
    await itemRepo.save(item);

    const expUc = new GetExpiringLotsUseCase(itemRepo);
    const expRes = await expUc.execute({
      warehouseId: 'WH-1',
      daysThreshold: 15,
      includeAlreadyExpired: true,
      referenceDate: now,
    });

    expect(expRes.expiringLots).toHaveLength(1);
    expect(expRes.expiringLots[0].lot.lotNumber).toBe('LOT-SOON');
    expect(expRes.expiredLots).toHaveLength(1);
    expect(expRes.expiredLots[0].lot.lotNumber).toBe('LOT-EXP');

    const quarUc = new ManageLotQuarantineUseCase(itemRepo, whRepo, movRepo);
    const qRes = await quarUc.execute({
      action: 'QUARANTINE',
      itemId: 'med-1',
      warehouseId: 'WH-1',
      lotNumber: 'LOT-SOON',
      reason: 'Revisión de temperatura',
      performedBy: operator,
    });
    expect(qRes.lot?.status).toBe('QUARANTINED');

    const wRes = await quarUc.execute({
      action: 'WRITE_OFF',
      itemId: 'med-1',
      warehouseId: 'WH-1',
      lotNumber: 'LOT-EXP',
      reason: 'Producto caducado',
      performedBy: operator,
      authorizedBy: supervisor,
    });
    expect(wRes.movement?.quantity).toBe(5);

    const updated = (await itemRepo.findById('med-1'))!;
    expect(updated.getOnHandStock('WH-1')).toBe(20);
  });

  it('debe despachar combos (BOM) y ensamblar productos terminados con persistencia', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    const compRepo = new InMemoryCompositeProductRepository();

    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Cocina' }));

    const pan = new InventoryItem({ id: 'pan', sku: 'PAN', name: 'Pan' });
    const carne = new InventoryItem({ id: 'carne', sku: 'CARNE', name: 'Carne' });
    const burger = new InventoryItem({ id: 'burger', sku: 'BURGER', name: 'Hamburguesa Lista' });

    pan.receiveStock({ movementId: 'm1', warehouseId: 'WH-1', quantity: 20, unitCost: Money.fromDecimal(1, 'USD'), performedBy: operator });
    carne.receiveStock({ movementId: 'm2', warehouseId: 'WH-1', quantity: 20, unitCost: Money.fromDecimal(3, 'USD'), performedBy: operator });
    await itemRepo.save(pan);
    await itemRepo.save(carne);
    await itemRepo.save(burger);

    await compRepo.save(
      new CompositeProduct({
        compositeItemId: 'combo-1',
        name: 'Combo Clásico',
        components: [
          { itemId: 'pan', quantity: 2 },
          { itemId: 'carne', quantity: 1 },
        ],
      })
    );

    const dispatchCombo = new DispatchCompositeProductUseCase(compRepo, itemRepo, whRepo, movRepo);
    const comboRes = await dispatchCombo.execute({
      compositeId: 'combo-1',
      warehouseId: 'WH-1',
      quantity: 3, // 6 panes ($6) + 3 carnes ($9) = $15
      performedBy: operator,
    });

    expect(comboRes.totalCost.toCents()).toBe(1500);
    expect((await itemRepo.findById('pan'))?.getOnHandStock('WH-1')).toBe(14);
    expect((await itemRepo.findById('carne'))?.getOnHandStock('WH-1')).toBe(17);

    const assembleUc = new AssembleProductUseCase(itemRepo, whRepo, movRepo);
    const asmRes = await assembleUc.execute({
      warehouseId: 'WH-1',
      finishedItemId: 'burger',
      quantityToProduce: 2,
      recipeComponents: [
        { itemId: 'pan', quantityPerUnit: 1 },
        { itemId: 'carne', quantityPerUnit: 1 },
      ],
      additionalCostPerUnit: Money.fromDecimal(0.5, 'USD'),
      performedBy: operator,
    });

    expect(asmRes.unitCost.toCents()).toBe(450); // $1 + $3 + $0.50
    expect((await itemRepo.findById('burger'))?.getOnHandStock('WH-1')).toBe(2);
  });

  it('debe consultar el Kardex filtrado/paginado y calcular valorización consolidada del portafolio', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Central' }));

    const i1 = new InventoryItem({ id: 'i1', sku: 'S1', name: 'Item 1' });
    const i2 = new InventoryItem({ id: 'i2', sku: 'S2', name: 'Item 2' });
    const r1 = i1.receiveStock({ movementId: 'm1', warehouseId: 'WH-1', quantity: 10, unitCost: Money.fromDecimal(4, 'USD'), performedBy: operator });
    const r2 = i1.dispatchStock({ movementId: 'm2', warehouseId: 'WH-1', quantity: 3, performedBy: operator });
    const r3 = i2.receiveStock({ movementId: 'm3', warehouseId: 'WH-1', quantity: 5, unitCost: Money.fromDecimal(6, 'USD'), performedBy: operator });

    await itemRepo.save(i1);
    await itemRepo.save(i2);
    await movRepo.save(r1.movement);
    await movRepo.save(r2.movement);
    await movRepo.save(r3.movement);

    const kardexUc = new GetKardexUseCase(movRepo);
    const kRes = await kardexUc.execute({ itemId: 'i1', warehouseId: 'WH-1' });
    expect(kRes.totalMovements).toBe(2);
    expect(kRes.totalInboundQuantity).toBe(10);
    expect(kRes.totalOutboundQuantity).toBe(3);
    expect(kRes.totalInboundCost.toCents()).toBe(4000);
    expect(kRes.totalOutboundCost.toCents()).toBe(1200);

    const onlyOut = await kardexUc.execute({ type: StockMovementType.SALE_DISPATCH });
    expect(onlyOut.movements).toHaveLength(1);

    const portfolio = ValuationService.calculatePortfolioValuation(await itemRepo.listAll(), 'WH-1');
    expect(portfolio.totalItems).toBe(2);
    expect(portfolio.totalUnits).toBe(12); // 7 + 5
    expect(portfolio.totalValuation.toCents()).toBe(5800); // 2800 + 3000
  });
});
