import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryInventoryRepository,
  InMemoryReceivingOrderRepository,
  InMemoryStockMovementRepository,
  InMemoryWarehouseRepository,
  InvalidReceivingOrderStateError,
  InventoryItem,
  Money,
  ReceivePurchaseOrderUseCase,
  ReceivingOrder,
  ReceivingOverdeliveryError,
  Warehouse,
} from '../src/index.js';

describe('Receiving Orders & Partial Deliveries (Backorders)', () => {
  let orderRepo: InMemoryReceivingOrderRepository;
  let itemRepo: InMemoryInventoryRepository;
  let warehouseRepo: InMemoryWarehouseRepository;
  let movementRepo: InMemoryStockMovementRepository;

  const performer = { id: 'usr-wh', name: 'Receptor de Muelle' };

  beforeEach(async () => {
    orderRepo = new InMemoryReceivingOrderRepository();
    itemRepo = new InMemoryInventoryRepository();
    warehouseRepo = new InMemoryWarehouseRepository();
    movementRepo = new InMemoryStockMovementRepository();

    const wh = new Warehouse({ id: 'WH-MAIN', code: 'MAIN', name: 'Bodega Principal' });
    await warehouseRepo.save(wh);

    const item = new InventoryItem({
      id: 'item-cereal',
      sku: 'SKU-CEREAL',
      name: 'Cereal de Avena 500g',
    });
    await itemRepo.save(item);
  });

  it('debe gestionar entregas parciales y calcular saldos pendientes de recibir (Backorder)', () => {
    let order = new ReceivingOrder({
      id: 'RO-001',
      orderNumber: 'OC-2026-100',
      warehouseId: 'WH-MAIN',
      supplierId: 'SUPP-AGRO',
      supplierName: 'AgroAlimentos S.A.',
      items: [
        { itemId: 'item-cereal', expectedQuantity: 100, unitCost: Money.fromDecimal(3, 'USD') },
      ],
    });

    expect(order.status).toBe('DRAFT');
    order = order.approve();
    expect(order.status).toBe('APPROVED');
    expect(order.getPendingQuantity('item-cereal')).toBe(100);

    // Entrega 1: Llegan 40 unidades
    order = order.receiveItem({ itemId: 'item-cereal', quantity: 40 });
    expect(order.status).toBe('PARTIALLY_RECEIVED');
    expect(order.getPendingQuantity('item-cereal')).toBe(60);
    expect(order.isFullyReceived()).toBe(false);

    // Entrega 2: Llegan las 60 restantes
    order = order.receiveItem({ itemId: 'item-cereal', quantity: 60 });
    expect(order.status).toBe('COMPLETED');
    expect(order.getPendingQuantity('item-cereal')).toBe(0);
    expect(order.isFullyReceived()).toBe(true);
  });

  it('debe rechazar sobredespacho si allowOverdelivery es false', () => {
    let order = new ReceivingOrder({
      id: 'RO-002',
      orderNumber: 'OC-2026-101',
      warehouseId: 'WH-MAIN',
      items: [
        { itemId: 'item-cereal', expectedQuantity: 50, unitCost: Money.fromDecimal(3, 'USD') },
      ],
    });
    order = order.approve();

    expect(() =>
      order.receiveItem({ itemId: 'item-cereal', quantity: 51, allowOverdelivery: false })
    ).toThrow(ReceivingOverdeliveryError);
  });

  it('debe integrar la recepción en almacén con ReceivePurchaseOrderUseCase y generar Kardex', async () => {
    let order = new ReceivingOrder({
      id: 'RO-003',
      orderNumber: 'OC-2026-102',
      warehouseId: 'WH-MAIN',
      items: [
        { itemId: 'item-cereal', expectedQuantity: 80, unitCost: Money.fromDecimal(3, 'USD') },
      ],
    });
    order = order.approve();
    await orderRepo.save(order);

    const useCase = new ReceivePurchaseOrderUseCase(orderRepo, itemRepo, warehouseRepo, movementRepo);

    // Recepción parcial de 30 unidades
    const res = await useCase.execute({
      orderId: 'RO-003',
      itemId: 'item-cereal',
      quantity: 30,
      performedBy: performer,
    });

    expect(res.order.status).toBe('PARTIALLY_RECEIVED');
    expect(res.pendingQuantityForThisItem).toBe(50);
    expect(res.isOrderCompleted).toBe(false);

    // Verificar que el stock físico aumentó en el almacén
    const item = (await itemRepo.findById('item-cereal'))!;
    expect(item.getOnHandStock('WH-MAIN')).toBe(30);

    // Verificar movimiento de Kardex
    expect(res.movement.type).toBe('PURCHASE_RECEIPT');
    expect(res.movement.referenceId).toBe('OC-2026-102');
    expect(res.movement.quantity).toBe(30);
  });

  it('debe rechazar recepciones en órdenes canceladas', () => {
    let order = new ReceivingOrder({
      id: 'RO-004',
      orderNumber: 'OC-2026-103',
      warehouseId: 'WH-MAIN',
      items: [
        { itemId: 'item-cereal', expectedQuantity: 20, unitCost: Money.fromDecimal(3, 'USD') },
      ],
    });
    order = order.cancel('Proveedor sin stock');
    expect(order.status).toBe('CANCELLED');

    expect(() =>
      order.receiveItem({ itemId: 'item-cereal', quantity: 10 })
    ).toThrow(InvalidReceivingOrderStateError);
  });
});
