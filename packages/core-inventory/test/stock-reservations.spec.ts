import { describe, expect, it } from 'vitest';
import {
  InsufficientStockError,
  InventoryItem,
  Money,
  ReservationExpiredError,
  StockReservation,
  StockReservationService,
} from '../src/index.js';

describe('Stock Reservations & TTL Allocations', () => {
  const performer = { id: 'usr-1', name: 'Vendedor' };
  const cost = Money.fromDecimal(50, 'USD');

  it('debe apartar stock reduciendo el disponible sin tocar la existencia física on-hand', () => {
    const item = new InventoryItem({
      id: 'item-res-1',
      sku: 'SKU-SPEAKER',
      name: 'Parlante Bluetooth',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-STORE',
      quantity: 10,
      unitCost: cost,
      performedBy: performer,
    });

    expect(item.getOnHandStock('WH-STORE')).toBe(10);
    expect(item.getAvailableStock('WH-STORE')).toBe(10);

    // Reservar 4 unidades para un carrito de compras web (TTL 600 segundos)
    const reservation = item.reserveStock({
      reservationId: 'RES-001',
      warehouseId: 'WH-STORE',
      quantity: 4,
      referenceId: 'CART-999',
      ttlSeconds: 600,
    });

    expect(reservation.status).toBe('ACTIVE');
    expect(item.getOnHandStock('WH-STORE')).toBe(10); // Físico intacto
    expect(item.getReservedStock('WH-STORE')).toBe(4);
    expect(item.getAvailableStock('WH-STORE')).toBe(6); // Disponible = 10 - 4 = 6
  });

  it('debe impedir sobreventas lanzando InsufficientStockError si la reserva supera el disponible', () => {
    const item = new InventoryItem({
      id: 'item-res-2',
      sku: 'SKU-HEADPHONES',
      name: 'Auriculares Inalámbricos',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-STORE',
      quantity: 5,
      unitCost: cost,
      performedBy: performer,
    });

    // Intentar reservar 6 unidades cuando solo hay 5
    expect(() =>
      item.reserveStock({
        reservationId: 'RES-002',
        warehouseId: 'WH-STORE',
        quantity: 6,
        referenceId: 'CART-100',
      })
    ).toThrow(InsufficientStockError);
  });

  it('debe liberar la reserva y restaurar la disponibilidad cuando el cliente cancela el pedido', () => {
    const item = new InventoryItem({
      id: 'item-res-3',
      sku: 'SKU-MOUSE',
      name: 'Mouse Gamer',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-STORE',
      quantity: 8,
      unitCost: cost,
      performedBy: performer,
    });

    item.reserveStock({
      reservationId: 'RES-003',
      warehouseId: 'WH-STORE',
      quantity: 3,
      referenceId: 'CART-555',
    });

    expect(item.getAvailableStock('WH-STORE')).toBe(5);

    // Liberar reserva
    item.releaseReservation({
      warehouseId: 'WH-STORE',
      quantity: 3,
      reservationId: 'RES-003',
    });

    expect(item.getReservedStock('WH-STORE')).toBe(0);
    expect(item.getAvailableStock('WH-STORE')).toBe(8);
  });

  it('debe confirmar la reserva (commit) convirtiéndola en despacho físico al concretar el pago', () => {
    const item = new InventoryItem({
      id: 'item-res-4',
      sku: 'SKU-KEYBOARD',
      name: 'Teclado Mecánico',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-STORE',
      quantity: 10,
      unitCost: cost,
      performedBy: performer,
    });

    item.reserveStock({
      reservationId: 'RES-004',
      warehouseId: 'WH-STORE',
      quantity: 2,
      referenceId: 'ORDER-777',
    });

    // Confirmar pago y despachar
    const { movement, totalCost } = item.commitReservation({
      movementId: 'mov-disp-commit',
      warehouseId: 'WH-STORE',
      quantity: 2,
      reservationId: 'RES-004',
      referenceId: 'TICKET-777',
      performedBy: performer,
    });

    expect(movement.type).toBe('SALE_DISPATCH');
    expect(totalCost.toDecimal()).toBe(100);
    expect(item.getReservedStock('WH-STORE')).toBe(0);
    expect(item.getOnHandStock('WH-STORE')).toBe(8);
    expect(item.getAvailableStock('WH-STORE')).toBe(8);
  });

  it('debe identificar reservas expiradas por TTL y liberarlas con StockReservationService', () => {
    const item = new InventoryItem({
      id: 'item-res-5',
      sku: 'SKU-MONITOR',
      name: 'Monitor 27 Pulgadas',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-STORE',
      quantity: 5,
      unitCost: cost,
      performedBy: performer,
    });

    // Reserva con fecha de expiración en el pasado
    const pastExpiresAt = new Date(Date.now() - 1000);
    const expiredRes = new StockReservation({
      id: 'RES-EXPIRED',
      itemId: 'item-res-5',
      warehouseId: 'WH-STORE',
      quantity: 2,
      referenceId: 'CART-OLD',
      expiresAt: pastExpiresAt,
    });

    // Simular que el item tenía reservadas esas 2 unidades
    item.reserveStock({
      reservationId: 'RES-EXPIRED',
      warehouseId: 'WH-STORE',
      quantity: 2,
      referenceId: 'CART-OLD',
    });

    expect(item.getAvailableStock('WH-STORE')).toBe(3);

    const { expiredReservations, updatedItem } = StockReservationService.releaseExpiredReservations(item, [
      expiredRes,
    ]);

    expect(expiredReservations.length).toBe(1);
    expect(expiredReservations[0].status).toBe('EXPIRED');
    expect(updatedItem.getAvailableStock('WH-STORE')).toBe(5);
  });
});
