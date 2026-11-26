import { describe, expect, it } from 'vitest';
import {
  AdjustStockUseCase,
  BinLocation,
  CompositeProduct,
  CurrencyMismatchError,
  IInventoryEventBus,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryStockReservationRepository,
  InMemoryStockTransferRepository,
  InMemoryWarehouseRepository,
  InventoryCount,
  InventoryDomainEvent,
  InventoryItem,
  Money,
  ReceivingOrder,
  RecordStockInUseCase,
  RecordStockOutUseCase,
  ReleaseExpiredReservationsUseCase,
  ReservationExpiredError,
  ReserveStockUseCase,
  SchemaValidationError,
  StockMovement,
  StockReservation,
  StockTransfer,
  TransferStockUseCase,
  UnitOfMeasure,
  Warehouse,
} from '../src/index.js';

describe('Integrity Fixes & Domain Enhancements', () => {
  const operator = { id: 'usr-op', name: 'Operador', role: 'WAREHOUSE_OPERATOR' };
  const supervisor = { id: 'usr-sup', name: 'Supervisor', role: 'SUPERVISOR' };

  it('debe calcular el CMP global considerando el stock de todas las bodegas', () => {
    const item = new InventoryItem({
      id: 'item-cmp-multi',
      sku: 'SKU-CMP',
      name: 'Café Molido',
      valuationMethod: 'WEIGHTED_AVERAGE',
    });

    // 10 unidades a $10.00 en WH-1 -> CMP = $10.00
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromDecimal(10, 'USD'),
      performedBy: operator,
    });

    // 10 unidades a $20.00 en WH-2 -> CMP global debe ser ($100 + $200) / 20 = $15.00
    item.receiveStock({
      movementId: 'm2',
      warehouseId: 'WH-2',
      quantity: 10,
      unitCost: Money.fromDecimal(20, 'USD'),
      performedBy: operator,
    });

    expect(item.averageCost.toCents()).toBe(1500);
    expect(item.getTotalOnHandStock()).toBe(20);
  });

  it('debe rechazar ingresos en moneda distinta cuando ya existe stock', () => {
    const item = new InventoryItem({
      id: 'item-cur',
      sku: 'SKU-CUR',
      name: 'Producto',
    });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: Money.fromDecimal(10, 'USD'),
      performedBy: operator,
    });

    expect(() =>
      item.receiveStock({
        movementId: 'm2',
        warehouseId: 'WH-1',
        quantity: 5,
        unitCost: Money.fromDecimal(10, 'EUR'),
        performedBy: operator,
      })
    ).toThrow(CurrencyMismatchError);
  });

  it('debe soportar múltiples códigos de barras, reglas de reorden por bodega y BinLocations', async () => {
    const repo = new InMemoryInventoryRepository();
    const bin = BinLocation.of('A01', 'R02', 'S01', 'B03', 'SECO');
    const item = new InventoryItem({
      id: 'item-multi',
      sku: 'SKU-MULTI',
      barcode: '750100000001',
      barcodes: ['750100000002', '750100000003'],
      name: 'Aceite Vegetal',
      reorderRules: { minStock: 5, reorderPoint: 10 },
      warehouseReorderRules: {
        'WH-MINI': { minStock: 1, reorderPoint: 2 },
      },
    });

    item.assignBinLocation('WH-CENTRAL', bin);
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-MINI',
      quantity: 4,
      unitCost: Money.fromDecimal(3, 'USD'),
      performedBy: operator,
    });
    await repo.save(item);

    const found = await repo.findByBarcode('750100000003');
    expect(found?.id).toBe('item-multi');
    expect(found?.getBinLocations('WH-CENTRAL')[0].code).toBe('SECO-A01-R02-S01-B03');
    expect(found?.isLowStock('WH-MINI')).toBe(false); // 4 > reorderPoint 2 en WH-MINI
    expect(found?.isLowStock('WH-CENTRAL')).toBe(true); // 0 <= reorderPoint 10 global
  });

  it('debe convertir unidades de medida (UoM) en RecordStockInUseCase y RecordStockOutUseCase', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    const published: InventoryDomainEvent[] = [];
    const eventBus: IInventoryEventBus = {
      publish: async (evts) => {
        published.push(...evts);
      },
    };

    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Principal' }));
    const item = new InventoryItem({
      id: 'item-uom',
      sku: 'SKU-HARINA',
      name: 'Harina',
      uom: UnitOfMeasure.GRAM,
    });
    await itemRepo.save(item);

    const inUc = new RecordStockInUseCase(itemRepo, whRepo, movRepo, eventBus);
    const outUc = new RecordStockOutUseCase(itemRepo, whRepo, movRepo, eventBus);

    // Ingresar 2 KG a $5.00/KG -> 2000 G a $0.005/G
    const inRes = await inUc.execute({
      itemId: 'item-uom',
      warehouseId: 'WH-1',
      quantity: 2,
      inputUom: UnitOfMeasure.KILOGRAM,
      unitCost: Money.fromDecimal(5, 'USD'),
      performedBy: operator,
    });
    expect(inRes.movement.quantity).toBe(2000);

    // Despachar 500 G -> quedan 1500 G
    const outRes = await outUc.execute({
      itemId: 'item-uom',
      warehouseId: 'WH-1',
      quantity: 0.5,
      inputUom: UnitOfMeasure.KILOGRAM,
      performedBy: operator,
    });
    expect(outRes.movement.balanceAfter).toBe(1500);
    expect(published.some((e) => e.eventName === 'StockReceivedEvent')).toBe(true);
    expect(published.some((e) => e.eventName === 'StockDispatchedEvent')).toBe(true);
  });

  it('debe sincronizar lotes y seriales en AdjustStockUseCase', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Principal' }));

    const itemLot = new InventoryItem({
      id: 'item-lot-adj',
      sku: 'SKU-LOT',
      name: 'Yogurt',
      trackingType: 'BATCH_LOT',
    });
    itemLot.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromDecimal(2, 'USD'),
      lotProps: {
        lotNumber: 'L-100',
        expirationDate: new Date(Date.now() + 86400000 * 30),
        initialQuantity: 10,
        currentQuantity: 10,
      },
      performedBy: operator,
    });
    await itemRepo.save(itemLot);

    const adjUc = new AdjustStockUseCase(itemRepo, whRepo, movRepo);
    await adjUc.execute({
      itemId: 'item-lot-adj',
      warehouseId: 'WH-1',
      deltaQuantity: -3,
      reason: 'Envases dañados',
      lotNumber: 'L-100',
      performedBy: operator,
      authorizedBy: supervisor,
    });

    const updated = (await itemRepo.findById('item-lot-adj'))!;
    expect(updated.getOnHandStock('WH-1')).toBe(7);
    expect(updated.getWarehouseStock('WH-1')?.lots[0].currentQuantity).toBe(7);
  });

  it('debe cancelar un traslado en tránsito y trasladar lotes/seriales preservando trazabilidad', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const trfRepo = new InMemoryStockTransferRepository();
    const movRepo = new InMemoryStockMovementRepository();

    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'W1', name: 'Origen' }));
    await whRepo.save(new Warehouse({ id: 'WH-2', code: 'W2', name: 'Destino' }));

    const item = new InventoryItem({
      id: 'item-ser-trf',
      sku: 'SKU-LAP',
      name: 'Laptop',
      trackingType: 'SERIAL',
    });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 2,
      unitCost: Money.fromDecimal(500, 'USD'),
      serials: ['SN-01', 'SN-02'],
      performedBy: operator,
    });
    await itemRepo.save(item);

    const trfUc = new TransferStockUseCase(itemRepo, whRepo, trfRepo, movRepo);

    // Despachar SN-01 y luego cancelar
    await trfUc.execute({
      action: 'DISPATCH',
      transferId: 'TRF-C1',
      fromWarehouseId: 'WH-1',
      toWarehouseId: 'WH-2',
      itemId: 'item-ser-trf',
      quantity: 1,
      serialNumbers: ['SN-01'],
      performedBy: operator,
    });

    const cancelled = await trfUc.execute({
      action: 'CANCEL',
      transferId: 'TRF-C1',
      reason: 'Orden cancelada',
      performedBy: operator,
    });

    expect(cancelled.transfer.status).toBe('CANCELLED');
    const afterCancel = (await itemRepo.findById('item-ser-trf'))!;
    expect(afterCancel.getOnHandStock('WH-1')).toBe(2);
    expect(afterCancel.getInTransitStock('WH-1')).toBe(0);
    expect(afterCancel.getWarehouseStock('WH-1')?.serials.find((s) => s.serialNumber === 'SN-01')?.status).toBe(
      'IN_STOCK'
    );
  });

  it('debe validar expiración en ReserveStockUseCase y liberar vencidas con ReleaseExpiredReservationsUseCase', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const movRepo = new InMemoryStockMovementRepository();
    const resRepo = new InMemoryStockReservationRepository();

    const item = new InventoryItem({ id: 'item-res', sku: 'SKU-R', name: 'Producto R' });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromDecimal(5, 'USD'),
      performedBy: operator,
    });
    await itemRepo.save(item);

    const resUc = new ReserveStockUseCase(itemRepo, movRepo, resRepo);
    await resUc.execute({
      action: 'RESERVE',
      reservationId: 'RES-1',
      itemId: 'item-res',
      warehouseId: 'WH-1',
      quantity: 4,
      referenceId: 'CART-1',
      ttlSeconds: 60,
    });

    const futureDate = new Date(Date.now() + 120 * 1000);

    await expect(
      resUc.execute({
        action: 'COMMIT',
        reservationId: 'RES-1',
        itemId: 'item-res',
        warehouseId: 'WH-1',
        quantity: 4,
        performedBy: operator,
        referenceDate: futureDate,
      })
    ).rejects.toThrow(ReservationExpiredError);

    const cleanupUc = new ReleaseExpiredReservationsUseCase(itemRepo, resRepo);
    const cleanupRes = await cleanupUc.execute({ referenceDate: futureDate });
    expect(cleanupRes.releasedCount).toBe(1);
    expect(cleanupRes.expiredReservations[0].status).toBe('EXPIRED');

    const itemAfter = (await itemRepo.findById('item-res'))!;
    expect(itemAfter.getReservedStock('WH-1')).toBe(0);
    expect(itemAfter.getAvailableStock('WH-1')).toBe(10);
  });

  it('debe incluir schemaVersion en toJSON y rechazar versiones no soportadas en fromJSON', () => {
    const item = new InventoryItem({ id: 'i1', sku: 'S1', name: 'N1' });
    const json = item.toJSON();
    expect(json.schemaVersion).toBe(1);

    expect(() =>
      InventoryItem.fromJSON({
        ...json,
        schemaVersion: 99,
      })
    ).toThrow(SchemaValidationError);
  });

  it('debe validar con Zod payloads corruptos o anidados en todas las entidades de inventario', () => {
    const item = new InventoryItem({ id: 'i-zod', sku: 'SKU-ZOD', name: 'Item Zod' });
    const itemJson = item.toJSON();

    // Compatibilidad hacia atrás con payloads v1 sin schemaVersion
    const legacyItem = { ...itemJson };
    delete legacyItem.schemaVersion;
    expect(InventoryItem.fromJSON(legacyItem).id).toBe('i-zod');

    // Estructura anidada inválida en stocks / averageCost
    expect(() =>
      InventoryItem.fromJSON({
        ...itemJson,
        stocks: { 'WH-1': { warehouseId: 'WH-1', onHand: 'invalid' } },
      })
    ).toThrow(SchemaValidationError);

    expect(() => Warehouse.fromJSON({ id: 'w1', code: '', name: 'Almacén' })).toThrow(SchemaValidationError);
    expect(() => StockMovement.fromJSON({ id: 'm1' })).toThrow(SchemaValidationError);
    expect(() => StockReservation.fromJSON({ id: 'r1' })).toThrow(SchemaValidationError);
    expect(() => StockTransfer.fromJSON({ id: 't1' })).toThrow(SchemaValidationError);
    expect(() => CompositeProduct.fromJSON({ compositeItemId: '', name: 'Kit', components: [] })).toThrow(
      SchemaValidationError
    );
    expect(() => InventoryCount.fromJSON({ id: 'c1' })).toThrow(SchemaValidationError);
    expect(() => ReceivingOrder.fromJSON({ id: 'ro1' })).toThrow(SchemaValidationError);

    const kit = new CompositeProduct({
      compositeItemId: 'kit-1',
      name: 'Kit',
      components: [{ itemId: 'i-zod', quantity: 2 }],
    });
    expect(kit.toJSON().schemaVersion).toBe(1);
    expect(CompositeProduct.fromJSON(kit.toJSON()).compositeItemId).toBe('kit-1');
  });
});
