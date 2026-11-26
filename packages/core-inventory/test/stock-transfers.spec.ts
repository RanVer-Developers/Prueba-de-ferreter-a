import { describe, expect, it } from 'vitest';
import {
  InMemoryInventoryRepository,
  InMemoryStockMovementRepository,
  InMemoryStockTransferRepository,
  InMemoryWarehouseRepository,
  InventoryItem,
  Money,
  StockTransfer,
  TransferStockUseCase,
  Warehouse,
} from '../src/index.js';

describe('Stock Transfers & In-Transit Inventory', () => {
  const performer = { id: 'usr-logistics', name: 'Operador Logístico' };

  it('debe completar un traslado en 2 fases pasando por inventario en tránsito', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryStockTransferRepository();
    const movementRepo = new InMemoryStockMovementRepository();

    const whCentral = new Warehouse({ id: 'WH-CENTRAL', code: 'W-CEN', name: 'Bodega Central' });
    const whSucursal = new Warehouse({ id: 'WH-SUCURSAL', code: 'W-SUC', name: 'Sucursal Norte' });
    await warehouseRepo.save(whCentral);
    await warehouseRepo.save(whSucursal);

    const item = new InventoryItem({
      id: 'item-transfer',
      sku: 'SKU-COLA',
      name: 'Refresco Cola 2L',
    });

    // Cargar 100 unidades en Bodega Central
    item.receiveStock({
      movementId: 'mov-init',
      warehouseId: 'WH-CENTRAL',
      quantity: 100,
      unitCost: Money.fromDecimal(1.5, 'USD'),
      performedBy: performer,
    });
    await itemRepo.save(item);

    const useCase = new TransferStockUseCase(itemRepo, warehouseRepo, transferRepo, movementRepo);

    // 1. Fase de Despacho (Central -> Tránsito)
    const dispatchRes = await useCase.execute({
      action: 'DISPATCH',
      transferId: 'TRF-1001',
      fromWarehouseId: 'WH-CENTRAL',
      toWarehouseId: 'WH-SUCURSAL',
      itemId: 'item-transfer',
      quantity: 40,
      performedBy: performer,
      notes: 'Envío semanal a sucursal',
    });

    expect(dispatchRes.transfer.status).toBe('IN_TRANSIT');
    expect(dispatchRes.movement.type).toBe('TRANSFER_OUT');

    const itemAfterDispatch = (await itemRepo.findById('item-transfer'))!;
    expect(itemAfterDispatch.getOnHandStock('WH-CENTRAL')).toBe(60); // 100 - 40 = 60
    expect(itemAfterDispatch.getInTransitStock('WH-CENTRAL')).toBe(40);
    expect(itemAfterDispatch.getOnHandStock('WH-SUCURSAL')).toBe(0);

    // 2. Fase de Recepción en Destino (Tránsito -> Sucursal)
    const receiveRes = await useCase.execute({
      action: 'RECEIVE',
      transferId: 'TRF-1001',
      quantityReceived: 40,
      performedBy: { id: 'usr-sucursal', name: 'Jefe de Sucursal' },
    });

    expect(receiveRes.transfer.status).toBe('COMPLETED');
    expect(receiveRes.movement.type).toBe('TRANSFER_IN');

    const itemFinal = (await itemRepo.findById('item-transfer'))!;
    expect(itemFinal.getOnHandStock('WH-CENTRAL')).toBe(60);
    expect(itemFinal.getInTransitStock('WH-CENTRAL')).toBe(0);
    expect(itemFinal.getOnHandStock('WH-SUCURSAL')).toBe(40);
  });

  it('debe registrar discrepancia si la cantidad recibida difiere de la enviada', async () => {
    const itemRepo = new InMemoryInventoryRepository();
    const warehouseRepo = new InMemoryWarehouseRepository();
    const transferRepo = new InMemoryStockTransferRepository();
    const movementRepo = new InMemoryStockMovementRepository();

    const wh1 = new Warehouse({ id: 'WH-1', code: 'W1', name: 'Bodega 1' });
    const wh2 = new Warehouse({ id: 'WH-2', code: 'W2', name: 'Bodega 2' });
    await warehouseRepo.save(wh1);
    await warehouseRepo.save(wh2);

    const item = new InventoryItem({
      id: 'item-crisps',
      sku: 'SKU-CRISPS',
      name: 'Papas Fritas 150g',
    });

    item.receiveStock({
      movementId: 'mov-init',
      warehouseId: 'WH-1',
      quantity: 50,
      unitCost: Money.fromDecimal(1.0, 'USD'),
      performedBy: performer,
    });
    await itemRepo.save(item);

    const useCase = new TransferStockUseCase(itemRepo, warehouseRepo, transferRepo, movementRepo);

    await useCase.execute({
      action: 'DISPATCH',
      transferId: 'TRF-1002',
      fromWarehouseId: 'WH-1',
      toWarehouseId: 'WH-2',
      itemId: 'item-crisps',
      quantity: 20,
      performedBy: performer,
    });

    // Se despacharon 20, pero solo llegaron 18 físicamente (2 dañadas en trayecto)
    const receiveRes = await useCase.execute({
      action: 'RECEIVE',
      transferId: 'TRF-1002',
      quantityReceived: 18,
      discrepancyReason: '2 bolsas rotas durante el transporte',
      performedBy: { id: 'usr-2', name: 'Receptor Bodega 2' },
    });

    expect(receiveRes.transfer.status).toBe('DISCREPANCY');
    expect(receiveRes.transfer.quantityReceived).toBe(18);
    expect(receiveRes.transfer.discrepancyReason).toBe('2 bolsas rotas durante el transporte');

    const itemFinal = (await itemRepo.findById('item-crisps'))!;
    expect(itemFinal.getOnHandStock('WH-2')).toBe(18);
    expect(itemFinal.getInTransitStock('WH-1')).toBe(0);
  });
});
