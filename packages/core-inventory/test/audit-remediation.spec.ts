import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  GetKardexUseCase,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryStockReservationRepository,
  InMemoryWarehouseRepository,
  InsufficientRoleError,
  InsufficientStockError,
  InvalidQuantityError,
  InventoryItem,
  ManageLotQuarantineUseCase,
  Money,
  ReserveStockUseCase,
  SchemaValidationError,
  Warehouse,
} from '../src/index.js';

describe('@modulos/core-inventory Audit Remediation Tests', () => {
  const operator = { id: 'op-1', name: 'Operador', role: 'WAREHOUSE_OPERATOR' };
  const supervisor = { id: 'sup-1', name: 'Supervisor', role: 'SUPERVISOR' };

  it('prevents reactivating EXPIRED lots and protects reserved units during writeOffLot', () => {
    const item = new InventoryItem({
      id: 'it-lot',
      sku: 'SKU-LOT',
      name: 'Leche',
      trackingType: 'BATCH_LOT',
    });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromCents(1000, 'USD'),
      lotProps: {
        lotNumber: 'L-EXP',
        expirationDate: new Date('2026-01-01T00:00:00Z'),
        initialQuantity: 10,
        currentQuantity: 10,
        status: 'EXPIRED',
      },
      performedBy: operator,
    });

    expect(() =>
      item.setLotStatus({
        warehouseId: 'WH-1',
        lotNumber: 'L-EXP',
        status: 'ACTIVE',
      })
    ).toThrow(SchemaValidationError);

    const itemRes = new InventoryItem({
      id: 'it-res',
      sku: 'SKU-RES',
      name: 'Jugo',
      trackingType: 'BATCH_LOT',
    });
    itemRes.receiveStock({
      movementId: 'm2',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: Money.fromCents(1000, 'USD'),
      lotProps: {
        lotNumber: 'L-1',
        expirationDate: new Date('2028-01-01T00:00:00Z'),
        initialQuantity: 5,
        currentQuantity: 5,
      },
      performedBy: operator,
    });
    itemRes.reserveStock({
      reservationId: 'res-1',
      warehouseId: 'WH-1',
      quantity: 4,
      referenceId: 'ORD-1',
    });

    expect(() =>
      itemRes.writeOffLot({
        movementId: 'm3',
        warehouseId: 'WH-1',
        lotNumber: 'L-1',
        reason: 'Damaged',
        performedBy: operator,
        authorizedBy: supervisor,
      })
    ).toThrow(InsufficientStockError);
  });

  it('requires supervisor authorization on quarantine RELEASE', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const whRepo = new InMemoryWarehouseRepository();
    const movRepo = new InMemoryStockMovementRepository();
    await whRepo.save(new Warehouse({ id: 'WH-1', code: 'WH1', name: 'Main' }));

    const item = new InventoryItem({
      id: 'it-q',
      sku: 'SKU-Q',
      name: 'Yogurt',
      trackingType: 'BATCH_LOT',
    });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 5,
      unitCost: Money.fromCents(500, 'USD'),
      lotProps: {
        lotNumber: 'L-Q',
        expirationDate: new Date('2028-01-01T00:00:00Z'),
        initialQuantity: 5,
        currentQuantity: 5,
      },
      performedBy: operator,
    });
    await itemRepo.save(item);

    const uc = new ManageLotQuarantineUseCase(itemRepo, whRepo, movRepo);
    await uc.execute({
      action: 'QUARANTINE',
      itemId: 'it-q',
      warehouseId: 'WH-1',
      lotNumber: 'L-Q',
      reason: 'Inspección',
      performedBy: operator,
    });

    await expect(
      uc.execute({
        action: 'RELEASE',
        itemId: 'it-q',
        warehouseId: 'WH-1',
        lotNumber: 'L-Q',
        reason: 'Sin autorización',
        performedBy: operator,
      })
    ).rejects.toThrow(InsufficientRoleError);

    const released = await uc.execute({
      action: 'RELEASE',
      itemId: 'it-q',
      warehouseId: 'WH-1',
      lotNumber: 'L-Q',
      reason: 'Aprobado',
      performedBy: operator,
      authorizedBy: supervisor,
    });
    expect(released.lot?.status).toBe('ACTIVE');
  });

  it('computes Kardex totals across full unpaginated dataset and rejects mixed currencies', async () => {
    const movRepo = new InMemoryStockMovementRepository();
    const item = new InventoryItem({ id: 'it-k', sku: 'SKU-K', name: 'Kardex' });
    const r1 = item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 2,
      unitCost: Money.fromCents(1000, 'USD'),
      performedBy: operator,
    });
    const r2 = item.receiveStock({
      movementId: 'm2',
      warehouseId: 'WH-1',
      quantity: 3,
      unitCost: Money.fromCents(1000, 'USD'),
      performedBy: operator,
    });
    await movRepo.save(r1.movement);
    await movRepo.save(r2.movement);

    const kardex = await new GetKardexUseCase(movRepo).execute({ itemId: 'it-k', limit: 1, offset: 0 });
    expect(kardex.movements).toHaveLength(1);
    expect(kardex.totalMovements).toBe(2);
    expect(kardex.totalInboundQuantity).toBe(5);
    expect(kardex.totalInboundCost.toCents()).toBe(5000);

    const eurItem = new InventoryItem({ id: 'it-eur', sku: 'SKU-E', name: 'Eur' });
    const rEur = eurItem.receiveStock({
      movementId: 'm3',
      warehouseId: 'WH-1',
      quantity: 1,
      unitCost: Money.fromCents(500, 'EUR'),
      performedBy: operator,
    });
    await movRepo.save(rEur.movement);

    await expect(
      new GetKardexUseCase(movRepo).execute({ warehouseId: 'WH-1' })
    ).rejects.toThrow(CurrencyMismatchError);
  });

  it('validates exact quantity on RELEASE/COMMIT in ReserveStockUseCase', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const movRepo = new InMemoryStockMovementRepository();
    const resRepo = new InMemoryStockReservationRepository();
    const item = new InventoryItem({ id: 'it-r', sku: 'SKU-R', name: 'Prod' });
    item.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromCents(1000, 'USD'),
      performedBy: operator,
    });
    await itemRepo.save(item);

    const uc = new ReserveStockUseCase(itemRepo, movRepo, resRepo);
    await uc.execute({
      action: 'RESERVE',
      reservationId: 'res-exact',
      itemId: 'it-r',
      warehouseId: 'WH-1',
      quantity: 4,
      referenceId: 'ORD-1',
    });

    await expect(
      uc.execute({
        action: 'RELEASE',
        reservationId: 'res-exact',
        itemId: 'it-r',
        warehouseId: 'WH-1',
        quantity: 2,
      })
    ).rejects.toThrow(InvalidQuantityError);
  });
});
