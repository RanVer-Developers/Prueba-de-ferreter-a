import { describe, expect, it } from 'vitest';
import {
  ConcurrencyError,
  InMemoryInventoryRepository,
  InventoryItem,
  Money,
  NegativeStockNotAllowedError,
  UnitOfMeasure,
} from '../src/index.js';

describe('InventoryItem Aggregate Root', () => {
  const performer = { id: 'usr-1', name: 'Laura Gómez', role: 'WAREHOUSE_MANAGER' };
  const cost = Money.fromDecimal(25.5, 'USD');

  it('debe rechazar salidas que dejen el stock en negativo si allowNegativeStock es false', () => {
    const item = new InventoryItem({
      id: 'item-inv-1',
      sku: 'SKU-SHIRT',
      name: 'Camisa Algodón L',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: cost,
      performedBy: performer,
    });

    expect(() =>
      item.dispatchStock({
        movementId: 'mov-2',
        warehouseId: 'WH-1',
        quantity: 6,
        allowNegativeStock: false,
        performedBy: performer,
      })
    ).toThrow(NegativeStockNotAllowedError);
  });

  it('debe permitir salidas en negativo si allowNegativeStock es true', () => {
    const item = new InventoryItem({
      id: 'item-inv-2',
      sku: 'SKU-PANTS',
      name: 'Pantalón Jean 32',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-1',
      quantity: 2,
      unitCost: cost,
      performedBy: performer,
    });

    const { movement } = item.dispatchStock({
      movementId: 'mov-2',
      warehouseId: 'WH-1',
      quantity: 5,
      allowNegativeStock: true,
      performedBy: performer,
    });

    expect(movement.balanceAfter).toBe(-3);
    expect(item.getOnHandStock('WH-1')).toBe(-3);
  });

  it('debe emitir eventos de dominio para stock bajo y stock agotado', () => {
    const item = new InventoryItem({
      id: 'item-inv-3',
      sku: 'SKU-SOCKS',
      name: 'Calcetines Deportivos',
      reorderRules: { minStock: 2, reorderPoint: 5 },
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: cost,
      performedBy: performer,
    });

    // Despacho que baja de 10 a 4 (punto de reorden es 5) -> debe emitir LowStockAlertTriggeredEvent
    item.dispatchStock({
      movementId: 'mov-2',
      warehouseId: 'WH-1',
      quantity: 6,
      performedBy: performer,
    });

    let events = item.pullDomainEvents();
    const lowStockEvt = events.find((e) => e.eventName === 'LowStockAlertTriggeredEvent');
    expect(lowStockEvt).toBeDefined();

    // Despacho de las 4 restantes -> agota stock (0) -> debe emitir OutOfStockAlertTriggeredEvent
    item.dispatchStock({
      movementId: 'mov-3',
      warehouseId: 'WH-1',
      quantity: 4,
      performedBy: performer,
    });

    events = item.pullDomainEvents();
    const outOfStockEvt = events.find((e) => e.eventName === 'OutOfStockAlertTriggeredEvent');
    expect(outOfStockEvt).toBeDefined();
  });

  it('debe aislar existencias de forma independiente entre diferentes bodegas', () => {
    const item = new InventoryItem({
      id: 'item-multi-wh',
      sku: 'SKU-SHOES',
      name: 'Zapatos de Cuero 42',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-NORTE',
      quantity: 20,
      unitCost: cost,
      performedBy: performer,
    });

    item.receiveStock({
      movementId: 'mov-2',
      warehouseId: 'WH-SUR',
      quantity: 35,
      unitCost: cost,
      performedBy: performer,
    });

    expect(item.getOnHandStock('WH-NORTE')).toBe(20);
    expect(item.getOnHandStock('WH-SUR')).toBe(35);

    item.dispatchStock({
      movementId: 'mov-3',
      warehouseId: 'WH-NORTE',
      quantity: 5,
      performedBy: performer,
    });

    expect(item.getOnHandStock('WH-NORTE')).toBe(15);
    expect(item.getOnHandStock('WH-SUR')).toBe(35); // Intacto
  });

  it('debe realizar serialización y deserialización lossless (round-trip)', () => {
    const item = new InventoryItem({
      id: 'item-snap',
      sku: 'SKU-JACKET',
      barcode: '7501234567890',
      name: 'Chaqueta Impermeable',
      uom: UnitOfMeasure.UNIT,
      valuationMethod: 'FIFO',
      averageCost: Money.fromDecimal(80, 'USD'),
      reorderRules: { minStock: 5, reorderPoint: 10 },
      trackingType: 'SIMPLE',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-1',
      quantity: 12,
      unitCost: Money.fromDecimal(80, 'USD'),
      performedBy: performer,
    });

    const json = item.toJSON();
    const restored = InventoryItem.fromJSON(json);

    expect(restored.id).toBe(item.id);
    expect(restored.sku).toBe(item.sku);
    expect(restored.barcode).toBe(item.barcode);
    expect(restored.getOnHandStock('WH-1')).toBe(12);
    expect(restored.valuationMethod).toBe('FIFO');
    expect(restored.version).toBe(item.version);
  });

  it('debe prevenir sobreescrituras concurrentes con control de versión optimista', async () => {
    const repo = new InMemoryInventoryRepository();
    const item = new InventoryItem({
      id: 'item-concurrency',
      sku: 'SKU-CAP',
      name: 'Gorra Deportiva',
    });

    await repo.save(item);

    // Leer instancia A y B
    const instanceA = (await repo.findById('item-concurrency'))!;
    const instanceB = (await repo.findById('item-concurrency'))!;

    // Instancia A muta y guarda (incrementa versión a 2)
    instanceA.receiveStock({
      movementId: 'mov-a',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: cost,
      performedBy: performer,
    });
    await repo.save(instanceA);

    // Instancia B intenta mutar y guardar sobre versión vieja (1) -> ConcurrencyError
    instanceB.receiveStock({
      movementId: 'mov-b',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: cost,
      performedBy: performer,
    });

    await expect(repo.save(instanceB)).rejects.toThrow(ConcurrencyError);
  });
});
