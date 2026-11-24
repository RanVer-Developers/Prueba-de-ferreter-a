import { describe, expect, it } from 'vitest';
import {
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InventoryItem,
  RecordStockInUseCase,
  Warehouse,
  WarehouseInactiveError,
  WarehouseNotFoundError,
} from '../src/index.js';

describe('Warehouse & Security Rules', () => {
  const performer = { id: 'usr-1', name: 'Almacenero' };

  it('debe impedir operaciones si el almacén no existe', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const warehouseRepo = new InMemoryWarehouseRepository();
    const movementRepo = new InMemoryStockMovementRepository();

    const item = new InventoryItem({
      id: 'item-wh-1',
      sku: 'SKU-TEST',
      name: 'Item Test',
    });
    await itemRepo.save(item);

    const useCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);

    await expect(
      useCase.execute({
        itemId: 'item-wh-1',
        warehouseId: 'WH-NON-EXISTING',
        quantity: 10,
        unitCost: { amount: 5, currency: 'USD' },
        performedBy: performer,
      })
    ).rejects.toThrow(WarehouseNotFoundError);
  });

  it('debe impedir operaciones si el almacén está inactivo', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const warehouseRepo = new InMemoryWarehouseRepository();
    const movementRepo = new InMemoryStockMovementRepository();

    let wh = new Warehouse({
      id: 'WH-INACTIVE',
      code: 'WH-INA',
      name: 'Bodega en remodelación',
      isActive: true,
    });
    wh = wh.deactivate();
    expect(wh.isActive).toBe(false);
    await warehouseRepo.save(wh);

    const item = new InventoryItem({
      id: 'item-wh-2',
      sku: 'SKU-TEST-2',
      name: 'Item Test 2',
    });
    await itemRepo.save(item);

    const useCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);

    await expect(
      useCase.execute({
        itemId: 'item-wh-2',
        warehouseId: 'WH-INACTIVE',
        quantity: 10,
        unitCost: { amount: 5, currency: 'USD' },
        performedBy: performer,
      })
    ).rejects.toThrow(WarehouseInactiveError);
  });

  it('debe permitir reactivar un almacén y reanudar operaciones', async () => {
    let wh = new Warehouse({
      id: 'WH-REACTIVATE',
      code: 'WH-REA',
      name: 'Bodega Temporal',
      isActive: false,
    });
    expect(wh.isActive).toBe(false);

    wh = wh.activate();
    expect(wh.isActive).toBe(true);

    const json = wh.toJSON();
    const restored = Warehouse.fromJSON(json);
    expect(restored.isActive).toBe(true);
    expect(restored.code).toBe('WH-REA');
  });
});
