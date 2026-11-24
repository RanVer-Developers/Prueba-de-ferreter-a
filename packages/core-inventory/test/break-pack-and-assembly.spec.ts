import { beforeEach, describe, expect, it } from 'vitest';
import {
  BreakPackRatioError,
  BreakPackUseCase,
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InsufficientStockError,
  InventoryItem,
  Money,
  StockTransformationService,
  UnitOfMeasure,
  Warehouse,
} from '../src/index.js';

describe('Break-Pack & Light Assembly (Stock Transformations)', () => {
  let itemRepo: InMemoryInventoryRepository;
  let warehouseRepo: InMemoryWarehouseRepository;
  let movementRepo: InMemoryStockMovementRepository;

  const performer = { id: 'usr-wh', name: 'Bodeguero' };

  beforeEach(async () => {
    itemRepo = new InMemoryInventoryRepository();
    warehouseRepo = new InMemoryWarehouseRepository();
    movementRepo = new InMemoryStockMovementRepository();

    const wh = new Warehouse({ id: 'WH-MAIN', code: 'MAIN', name: 'Almacén Central' });
    await warehouseRepo.save(wh);
  });

  describe('Break-Pack (Desempaque)', () => {
    it('debe desempacar 2 cajas de 24 latas en 48 latas sueltas prorrateando el costo exacto', async () => {
      // 1 Caja = 24 latas. Costo por caja = $24.00 USD ($1.00 por lata)
      const parentBox = new InventoryItem({
        id: 'item-beer-box',
        sku: 'SKU-BEER-BOX24',
        name: 'Caja Cerveza 24 Unidades',
        uom: UnitOfMeasure.BOX,
      });
      parentBox.receiveStock({
        movementId: 'm1',
        warehouseId: 'WH-MAIN',
        quantity: 5, // 5 cajas disponibles
        unitCost: Money.fromDecimal(24.0, 'USD'),
        performedBy: performer,
      });
      await itemRepo.save(parentBox);

      const childUnit = new InventoryItem({
        id: 'item-beer-can',
        sku: 'SKU-BEER-CAN',
        name: 'Lata Cerveza 355ml',
        uom: UnitOfMeasure.UNIT,
      });
      await itemRepo.save(childUnit);

      const useCase = new BreakPackUseCase(itemRepo, warehouseRepo, movementRepo);

      // Desempacar 2 cajas -> deben resultar 48 latas
      const result = await useCase.execute({
        warehouseId: 'WH-MAIN',
        parentItemId: 'item-beer-box',
        parentQuantityToBreak: 2,
        childItemId: 'item-beer-can',
        unitsPerPack: 24,
        performedBy: performer,
      });

      expect(result.totalChildUnitsCreated).toBe(48);
      expect(result.childUnitCost.toDecimal()).toBe(1.0);
      expect(result.totalCostTransferred.toDecimal()).toBe(48.0); // 2 cajas * $24 = $48.00

      // Verificar saldos en repositorios
      const updatedParent = (await itemRepo.findById('item-beer-box'))!;
      const updatedChild = (await itemRepo.findById('item-beer-can'))!;

      expect(updatedParent.getOnHandStock('WH-MAIN')).toBe(3); // 5 - 2 = 3 cajas
      expect(updatedChild.getOnHandStock('WH-MAIN')).toBe(48); // 48 latas

      // Kardex
      expect(result.parentMovement.type).toBe('PRODUCTION_CONSUMPTION');
      expect(result.childMovement.type).toBe('PRODUCTION_OUTPUT');
    });

    it('debe rechazar desempaque si no hay stock suficiente de cajas', async () => {
      const parentBox = new InventoryItem({
        id: 'item-box-empty',
        sku: 'SKU-EMPTY',
        name: 'Caja vacía',
      });
      await itemRepo.save(parentBox);

      const child = new InventoryItem({ id: 'item-unit', sku: 'SKU-U', name: 'Unidad' });
      await itemRepo.save(child);

      const useCase = new BreakPackUseCase(itemRepo, warehouseRepo, movementRepo);

      await expect(
        useCase.execute({
          warehouseId: 'WH-MAIN',
          parentItemId: 'item-box-empty',
          parentQuantityToBreak: 1,
          childItemId: 'item-unit',
          unitsPerPack: 12,
          performedBy: performer,
        })
      ).rejects.toThrow(InsufficientStockError);
    });

    it('debe rechazar unidades por empaque menores o iguales a cero', async () => {
      const parent = new InventoryItem({ id: 'p1', sku: 'P1', name: 'Padre' });
      parent.receiveStock({ movementId: 'm1', warehouseId: 'WH-MAIN', quantity: 10, unitCost: Money.fromDecimal(10), performedBy: performer });
      await itemRepo.save(parent);

      const child = new InventoryItem({ id: 'c1', sku: 'C1', name: 'Hijo' });
      await itemRepo.save(child);

      const useCase = new BreakPackUseCase(itemRepo, warehouseRepo, movementRepo);

      await expect(
        useCase.execute({
          warehouseId: 'WH-MAIN',
          parentItemId: 'p1',
          parentQuantityToBreak: 1,
          childItemId: 'c1',
          unitsPerPack: 0,
          performedBy: performer,
        })
      ).rejects.toThrow(BreakPackRatioError);
    });
  });

  describe('Light Assembly (Ensamble de Productos)', () => {
    it('debe ensamblar insumos en producto terminado sumando costos de componentes y mano de obra', () => {
      const madera = new InventoryItem({ id: 'ins-madera', sku: 'MADERA', name: 'Tablón de Madera' });
      const tornillos = new InventoryItem({ id: 'ins-tornillos', sku: 'TORNILLOS', name: 'Tornillos x10' });
      const mesa = new InventoryItem({ id: 'prod-mesa', sku: 'MESA', name: 'Mesa de Centro' });

      madera.receiveStock({
        movementId: 'm1',
        warehouseId: 'WH-MAIN',
        quantity: 10,
        unitCost: Money.fromDecimal(15, 'USD'),
        performedBy: performer,
      });

      tornillos.receiveStock({
        movementId: 'm2',
        warehouseId: 'WH-MAIN',
        quantity: 20,
        unitCost: Money.fromDecimal(2, 'USD'),
        performedBy: performer,
      });

      // 1 Mesa requiere 2 maderas ($30) y 4 tornillos ($8) + $12 mano de obra = $50 total por mesa
      const result = StockTransformationService.assemble({
        warehouseId: 'WH-MAIN',
        recipeComponents: [
          { item: madera, quantityPerUnit: 2 },
          { item: tornillos, quantityPerUnit: 4 },
        ],
        finishedItem: mesa,
        quantityToProduce: 2, // 2 Mesas
        additionalCostPerUnit: Money.fromDecimal(12, 'USD'), // Mano de obra
        performedBy: performer,
      });

      expect(result.finishedMovement.quantity).toBe(2);
      expect(result.unitCost.toDecimal()).toBe(50); // $50 cada una
      expect(result.totalProductionCost.toDecimal()).toBe(100); // 2 mesas = $100

      expect(madera.getOnHandStock('WH-MAIN')).toBe(6); // 10 - 4 = 6
      expect(tornillos.getOnHandStock('WH-MAIN')).toBe(12); // 20 - 8 = 12
      expect(mesa.getOnHandStock('WH-MAIN')).toBe(2);
    });
  });
});
