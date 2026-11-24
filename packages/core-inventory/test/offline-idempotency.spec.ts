import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateTransactionError,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InventoryItem,
  Money,
  RecordStockInUseCase,
  RecordStockOutUseCase,
  Warehouse,
} from '../src/index.js';

describe('Offline Idempotency & Edge Cases', () => {
  let itemRepo: InMemoryInventoryRepository;
  let warehouseRepo: InMemoryWarehouseRepository;
  let movementRepo: InMemoryStockMovementRepository;

  const performer = { id: 'usr-offline', name: 'Vendedor Offline' };

  beforeEach(async () => {
    itemRepo = new InMemoryInventoryRepository();
    warehouseRepo = new InMemoryWarehouseRepository();
    movementRepo = new InMemoryStockMovementRepository();

    const wh = new Warehouse({
      id: 'WH-MOBILE',
      code: 'MOB-1',
      name: 'Van de Reparto Móvil',
      isActive: true,
      allowNegativeStock: false,
    });
    await warehouseRepo.save(wh);

    const item = new InventoryItem({
      id: 'item-offline-1',
      sku: 'SKU-WATER-500ML',
      name: 'Agua Mineral 500ml',
    });
    await itemRepo.save(item);
  });

  it('debe devolver el movimiento original (isReplay: true) cuando se reenvía la misma transacción', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);

    // Entrada offline sincronizada 1 vez
    const res1 = await inUseCase.execute({
      itemId: 'item-offline-1',
      warehouseId: 'WH-MOBILE',
      quantity: 100,
      unitCost: { amount: 0.5, currency: 'USD' },
      performedBy: performer,
      idempotencyKey: 'offline-tx-999',
    });

    expect(res1.isReplay).toBe(false);
    expect(res1.movement.balanceAfter).toBe(100);

    // Reintento idéntico por timeout de red
    const res2 = await inUseCase.execute({
      itemId: 'item-offline-1',
      warehouseId: 'WH-MOBILE',
      quantity: 100,
      unitCost: { amount: 0.5, currency: 'USD' },
      performedBy: performer,
      idempotencyKey: 'offline-tx-999',
    });

    expect(res2.isReplay).toBe(true);
    expect(res2.movement.id).toBe(res1.movement.id);

    const item = (await itemRepo.findById('item-offline-1'))!;
    expect(item.getOnHandStock('WH-MOBILE')).toBe(100);
  });

  it('debe registrar el historial completo de movimientos en el repositorio de Kardex', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    const outUseCase = new RecordStockOutUseCase(itemRepo, warehouseRepo, movementRepo);

    await inUseCase.execute({
      itemId: 'item-offline-1',
      warehouseId: 'WH-MOBILE',
      quantity: 50,
      unitCost: { amount: 0.5, currency: 'USD' },
      performedBy: performer,
    });

    await outUseCase.execute({
      itemId: 'item-offline-1',
      warehouseId: 'WH-MOBILE',
      quantity: 10,
      performedBy: performer,
    });

    await outUseCase.execute({
      itemId: 'item-offline-1',
      warehouseId: 'WH-MOBILE',
      quantity: 5,
      performedBy: performer,
    });

    const movementsByItem = await movementRepo.listByItem('item-offline-1');
    expect(movementsByItem.length).toBe(3);
    expect(movementsByItem[0].type).toBe('PURCHASE_RECEIPT');
    expect(movementsByItem[0].balanceAfter).toBe(50);
    expect(movementsByItem[1].type).toBe('SALE_DISPATCH');
    expect(movementsByItem[1].balanceAfter).toBe(40);
    expect(movementsByItem[2].type).toBe('SALE_DISPATCH');
    expect(movementsByItem[2].balanceAfter).toBe(35);

    const movementsByWh = await movementRepo.listByWarehouse('WH-MOBILE');
    expect(movementsByWh.length).toBe(3);
  });

  it('debe rechazar recepción con cantidad menor o igual a cero', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await expect(
      inUseCase.execute({
        itemId: 'item-offline-1',
        warehouseId: 'WH-MOBILE',
        quantity: 0,
        unitCost: { amount: 1, currency: 'USD' },
        performedBy: performer,
      })
    ).rejects.toThrow('La cantidad a ingresar debe ser mayor a cero.');
  });

  it('debe rechazar despacho con cantidad menor o igual a cero', async () => {
    const outUseCase = new RecordStockOutUseCase(itemRepo, warehouseRepo, movementRepo);
    await expect(
      outUseCase.execute({
        itemId: 'item-offline-1',
        warehouseId: 'WH-MOBILE',
        quantity: -5,
        performedBy: performer,
      })
    ).rejects.toThrow('La cantidad a despachar debe ser mayor a cero.');
  });
});
