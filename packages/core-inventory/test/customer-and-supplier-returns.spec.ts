import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InventoryItem,
  Money,
  RecordCustomerReturnUseCase,
  RecordSupplierReturnUseCase,
  Warehouse,
} from '../src/index.js';

describe('Customer & Supplier Returns (RMA)', () => {
  let itemRepo: InMemoryInventoryRepository;
  let warehouseRepo: InMemoryWarehouseRepository;
  let movementRepo: InMemoryStockMovementRepository;

  const cashier = { id: 'usr-cashier', name: 'Cajero Carlos', role: 'CASHIER' };
  const supervisor = { id: 'usr-sup', name: 'Supervisora Ana', role: 'SUPERVISOR' };

  beforeEach(async () => {
    itemRepo = new InMemoryInventoryRepository();
    warehouseRepo = new InMemoryWarehouseRepository();
    movementRepo = new InMemoryStockMovementRepository();

    const wh = new Warehouse({ id: 'WH-STORE', code: 'STORE-1', name: 'Tienda Principal' });
    await warehouseRepo.save(wh);

    const item = new InventoryItem({
      id: 'item-blender',
      sku: 'SKU-BLENDER',
      name: 'Licuadora 600W',
      averageCost: Money.fromDecimal(40, 'USD'),
    });
    await itemRepo.save(item);
  });

  describe('RecordCustomerReturnUseCase', () => {
    it('debe devolver a RESTOCK reintegrando el stock disponible para reventa', async () => {
      const useCase = new RecordCustomerReturnUseCase(itemRepo, warehouseRepo, movementRepo);

      const res = await useCase.execute({
        itemId: 'item-blender',
        warehouseId: 'WH-STORE',
        quantity: 1,
        referenceId: 'TK-8899',
        destination: 'RESTOCK',
        performedBy: cashier,
        authorizedBy: supervisor,
      });

      expect(res.destination).toBe('RESTOCK');
      expect(res.movement.type).toBe('CUSTOMER_RETURN');
      expect(res.movement.balanceAfter).toBe(1);
      expect(res.writeOffMovement).toBeUndefined();

      const item = (await itemRepo.findById('item-blender'))!;
      expect(item.getOnHandStock('WH-STORE')).toBe(1);
      expect(item.getAvailableStock('WH-STORE')).toBe(1);
    });

    it('debe registrar baja inmediata (DAMAGED_WRITE_OFF) si el producto devuelto está roto', async () => {
      const useCase = new RecordCustomerReturnUseCase(itemRepo, warehouseRepo, movementRepo);

      const res = await useCase.execute({
        itemId: 'item-blender',
        warehouseId: 'WH-STORE',
        quantity: 1,
        referenceId: 'TK-8900',
        destination: 'DAMAGED_WRITE_OFF',
        performedBy: cashier,
        authorizedBy: supervisor,
      });

      expect(res.destination).toBe('DAMAGED_WRITE_OFF');
      expect(res.movement.type).toBe('CUSTOMER_RETURN');
      expect(res.writeOffMovement).toBeDefined();
      expect(res.writeOffMovement?.type).toBe('ADJUSTMENT_DECREASE');

      // El stock neto final es 0 porque se ingresó y se dio de baja de inmediato
      const item = (await itemRepo.findById('item-blender'))!;
      expect(item.getOnHandStock('WH-STORE')).toBe(0);
    });
  });

  describe('RecordSupplierReturnUseCase', () => {
    it('debe dar de baja stock por devolución a proveedor (RMA defectuoso)', async () => {
      const item = (await itemRepo.findById('item-blender'))!;
      item.receiveStock({
        movementId: 'm-init',
        warehouseId: 'WH-STORE',
        quantity: 10,
        unitCost: Money.fromDecimal(40, 'USD'),
        performedBy: cashier,
      });
      await itemRepo.save(item);

      const useCase = new RecordSupplierReturnUseCase(itemRepo, warehouseRepo, movementRepo);

      const res = await useCase.execute({
        itemId: 'item-blender',
        warehouseId: 'WH-STORE',
        quantity: 2,
        reason: 'Motor defectuoso de fábrica',
        referenceId: 'RMA-900',
        performedBy: cashier,
        authorizedBy: supervisor,
      });

      expect(res.movement.type).toBe('SUPPLIER_RETURN');
      expect(res.movement.quantity).toBe(2);
      expect(res.movement.balanceAfter).toBe(8);
      expect(res.totalCost.toDecimal()).toBe(80); // 2 * $40 = $80 USD

      const itemUpdated = (await itemRepo.findById('item-blender'))!;
      expect(itemUpdated.getOnHandStock('WH-STORE')).toBe(8);
    });
  });
});
