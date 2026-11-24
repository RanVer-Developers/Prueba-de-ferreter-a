import { beforeEach, describe, expect, it } from 'vitest';
import {
  AdjustStockUseCase,
  GetLowStockAlertsUseCase,
  GetStockAvailabilityUseCase,
  InMemoryInventoryCountRepository,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryStockTransferRepository,
  InMemoryWarehouseRepository,
  InsufficientRoleError,
  InventoryCount,
  InventoryItem,
  Money,
  ReconcileInventoryCountUseCase,
  RecordStockInUseCase,
  RecordStockOutUseCase,
  ReserveStockUseCase,
  SelfApprovalNotAllowedError,
  TransferStockUseCase,
  Warehouse,
} from '../src/index.js';

describe('Application Use Cases Integration', () => {
  let itemRepo: InMemoryInventoryRepository;
  let warehouseRepo: InMemoryWarehouseRepository;
  let movementRepo: InMemoryStockMovementRepository;
  let transferRepo: InMemoryStockTransferRepository;
  let countRepo: InMemoryInventoryCountRepository;

  const operator = { id: 'usr-op', name: 'Operador Carlos', role: 'OPERATOR' };
  const supervisor = { id: 'usr-sup', name: 'Supervisora Ana', role: 'SUPERVISOR' };

  beforeEach(async () => {
    itemRepo = new InMemoryInventoryRepository();
    warehouseRepo = new InMemoryWarehouseRepository();
    movementRepo = new InMemoryStockMovementRepository();
    transferRepo = new InMemoryStockTransferRepository();
    countRepo = new InMemoryInventoryCountRepository();

    // Crear almacén principal
    const warehouse = new Warehouse({
      id: 'WH-MAIN',
      code: 'MAIN',
      name: 'Almacén Principal Central',
      isActive: true,
      allowNegativeStock: false,
    });
    await warehouseRepo.save(warehouse);

    // Crear producto de prueba
    const item = new InventoryItem({
      id: 'item-100',
      sku: 'SKU-COFFEE-1KG',
      barcode: '779123456789',
      name: 'Café Grano Colombia 1kg',
      reorderRules: { minStock: 5, reorderPoint: 10 },
    });
    await itemRepo.save(item);
  });

  it('RecordStockInUseCase: debe registrar entradas de compras con idempotencia real', async () => {
    const useCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);

    const res1 = await useCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 50,
      unitCost: { amount: 12.5, currency: 'USD' },
      referenceId: 'OC-9001',
      performedBy: operator,
      idempotencyKey: 'idemp-purchase-001',
    });

    expect(res1.isReplay).toBe(false);
    expect(res1.movement.quantity).toBe(50);
    expect(res1.movement.balanceAfter).toBe(50);

    const item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(50);

    // Reintento de red con la misma clave de idempotencia
    const res2 = await useCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 50,
      unitCost: { amount: 12.5, currency: 'USD' },
      referenceId: 'OC-9001',
      performedBy: operator,
      idempotencyKey: 'idemp-purchase-001',
    });

    expect(res2.isReplay).toBe(true);
    expect(res2.movement.id).toBe(res1.movement.id);

    // El stock no se duplicó
    const itemAfterReplay = (await itemRepo.findById('item-100'))!;
    expect(itemAfterReplay.getOnHandStock('WH-MAIN')).toBe(50);
  });

  it('RecordStockOutUseCase: debe registrar salidas por venta y calcular costo contable', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await inUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 20,
      unitCost: { amount: 10, currency: 'USD' },
      performedBy: operator,
    });

    const outUseCase = new RecordStockOutUseCase(itemRepo, warehouseRepo, movementRepo);
    const outRes = await outUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 5,
      referenceId: 'TICKET-501',
      performedBy: operator,
      idempotencyKey: 'idemp-sale-001',
    });

    expect(outRes.isReplay).toBe(false);
    expect(outRes.totalCost.toDecimal()).toBe(50); // 5 * 10 = $50 USD
    expect(outRes.movement.balanceAfter).toBe(15);

    const item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(15);
  });

  it('AdjustStockUseCase: debe requerir autorización de supervisor para mermas y prohibir autoaprobación', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await inUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 30,
      unitCost: { amount: 10, currency: 'USD' },
      performedBy: operator,
    });

    const adjustUseCase = new AdjustStockUseCase(itemRepo, warehouseRepo, movementRepo);

    // 1. Falla si un operador intenta ajustar merma negativa sin supervisor
    await expect(
      adjustUseCase.execute({
        itemId: 'item-100',
        warehouseId: 'WH-MAIN',
        deltaQuantity: -2,
        reason: 'Bolsa rota',
        performedBy: operator,
      })
    ).rejects.toThrow(InsufficientRoleError);

    // 2. Falla si la supervisora intenta autoaprobar su propia merma
    await expect(
      adjustUseCase.execute({
        itemId: 'item-100',
        warehouseId: 'WH-MAIN',
        deltaQuantity: -2,
        reason: 'Bolsa rota',
        performedBy: supervisor,
        authorizedBy: supervisor, // Autoaprobación prohibida
      })
    ).rejects.toThrow(SelfApprovalNotAllowedError);

    // 3. Pasa con operador realizando y supervisora autorizando
    const adjustRes = await adjustUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      deltaQuantity: -2,
      reason: 'Bolsa rota',
      performedBy: operator,
      authorizedBy: supervisor,
    });

    expect(adjustRes.movement.quantity).toBe(2);
    expect(adjustRes.movement.balanceAfter).toBe(28);

    const item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(28);
  });

  it('ReserveStockUseCase: flujo completo de reserva y confirmación (commit)', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await inUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 10,
      unitCost: { amount: 10, currency: 'USD' },
      performedBy: operator,
    });

    const reserveUseCase = new ReserveStockUseCase(itemRepo, movementRepo);

    // 1. Reservar 3 unidades
    const resReserve = await reserveUseCase.execute({
      action: 'RESERVE',
      reservationId: 'RES-ORDER-1',
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 3,
      referenceId: 'WEB-ORDER-1',
    });
    expect(resReserve.reservation?.status).toBe('ACTIVE');

    let item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(10);
    expect(item.getAvailableStock('WH-MAIN')).toBe(7);

    // 2. Confirmar (commit)
    const resCommit = await reserveUseCase.execute({
      action: 'COMMIT',
      reservationId: 'RES-ORDER-1',
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 3,
      performedBy: operator,
    });

    expect(resCommit.movement?.type).toBe('SALE_DISPATCH');
    item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(7);
    expect(item.getAvailableStock('WH-MAIN')).toBe(7);
  });

  it('ReconcileInventoryCountUseCase: debe ajustar existencias automáticamente tras toma física', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await inUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 20,
      unitCost: { amount: 10, currency: 'USD' },
      performedBy: operator,
    });

    // Crear sesión de toma física: se contaron 18 unidades (faltan 2)
    let count = new InventoryCount({
      id: 'COUNT-Q1',
      warehouseId: 'WH-MAIN',
      name: 'Conteo Q1',
    });
    count = count.recordCount({
      itemId: 'item-100',
      systemQuantity: 20,
      countedQuantity: 18,
      unitCost: Money.fromDecimal(10, 'USD'),
      countedBy: 'Auditor Carlos',
    });
    await countRepo.save(count);

    const reconcileUseCase = new ReconcileInventoryCountUseCase(countRepo, itemRepo, movementRepo);
    const result = await reconcileUseCase.execute({
      countId: 'COUNT-Q1',
      reconciledBy: operator,
      authorizedBy: supervisor,
    });

    expect(result.count.status).toBe('RECONCILED');
    expect(result.adjustmentsApplied.length).toBe(1);
    expect(result.adjustmentsApplied[0].quantity).toBe(2);

    const item = (await itemRepo.findById('item-100'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(18); // Ajustado a lo contado físicamente
  });

  it('GetStockAvailabilityUseCase & GetLowStockAlertsUseCase: consultas de stock y alertas', async () => {
    const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);
    await inUseCase.execute({
      itemId: 'item-100',
      warehouseId: 'WH-MAIN',
      quantity: 4, // Menor al punto de reorden (10)
      unitCost: { amount: 10, currency: 'USD' },
      performedBy: operator,
    });

    const availUseCase = new GetStockAvailabilityUseCase(itemRepo);
    const avail = await availUseCase.execute({ sku: 'SKU-COFFEE-1KG', warehouseId: 'WH-MAIN' });

    expect(avail.totalOnHand).toBe(4);
    expect(avail.totalAvailable).toBe(4);
    expect(avail.byWarehouse[0].isLowStock).toBe(true);

    const alertsUseCase = new GetLowStockAlertsUseCase(itemRepo);
    const alerts = await alertsUseCase.execute({ warehouseId: 'WH-MAIN' });

    expect(alerts.lowStockAlerts.length).toBe(1);
    expect(alerts.lowStockAlerts[0].itemId).toBe('item-100');
  });
});
