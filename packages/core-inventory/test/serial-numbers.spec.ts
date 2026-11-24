import { describe, expect, it } from 'vitest';
import {
  DuplicateSerialNumberError,
  InventoryItem,
  InvalidSerialNumberStateError,
  Money,
  SerialNumber,
  SerialNumberNotFoundError,
} from '../src/index.js';

describe('SerialNumber Unit Tracking', () => {
  const cost = Money.fromDecimal(500, 'USD');
  const performer = { id: 'usr-tech', name: 'Técnico de Bodega' };

  it('debe registrar seriales únicos y prevenir duplicados', () => {
    const item = new InventoryItem({
      id: 'item-phone',
      sku: 'SKU-IPHONE-15',
      name: 'iPhone 15 Pro 256GB',
      trackingType: 'SERIAL',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-TECH',
      quantity: 2,
      unitCost: cost,
      serials: ['SN-001', 'SN-002'],
      performedBy: performer,
    });

    expect(item.getOnHandStock('WH-TECH')).toBe(2);

    // Intentar registrar el mismo serial SN-001 debe lanzar DuplicateSerialNumberError
    expect(() =>
      item.receiveStock({
        movementId: 'mov-2',
        warehouseId: 'WH-TECH',
        quantity: 1,
        unitCost: cost,
        serials: ['SN-001'],
        performedBy: performer,
      })
    ).toThrow(DuplicateSerialNumberError);
  });

  it('debe cambiar de estado al despachar un serial específico', () => {
    const item = new InventoryItem({
      id: 'item-macbook',
      sku: 'SKU-MACBOOK-M3',
      name: 'MacBook Air M3',
      trackingType: 'SERIAL',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-TECH',
      quantity: 3,
      unitCost: cost,
      serials: ['SN-MB-1', 'SN-MB-2', 'SN-MB-3'],
      performedBy: performer,
    });

    // Despachar SN-MB-2
    item.dispatchStock({
      movementId: 'mov-sale-1',
      warehouseId: 'WH-TECH',
      quantity: 1,
      serialNumbers: ['SN-MB-2'],
      referenceId: 'INVOICE-888',
      performedBy: performer,
    });

    const stock = item.getWarehouseStock('WH-TECH')!;
    const mb2 = stock.serials.find((s) => s.serialNumber === 'SN-MB-2')!;
    expect(mb2.status).toBe('SOLD');
    expect(mb2.referenceId).toBe('INVOICE-888');

    // Intentar venderlo de nuevo debe fallar por estado inválido
    expect(() =>
      item.dispatchStock({
        movementId: 'mov-sale-2',
        warehouseId: 'WH-TECH',
        quantity: 1,
        serialNumbers: ['SN-MB-2'],
        performedBy: performer,
      })
    ).toThrow(InvalidSerialNumberStateError);
  });

  it('debe lanzar SerialNumberNotFoundError si el serial no existe', () => {
    const item = new InventoryItem({
      id: 'item-ipad',
      sku: 'SKU-IPAD',
      name: 'iPad Pro',
      trackingType: 'SERIAL',
    });

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-TECH',
      quantity: 1,
      unitCost: cost,
      serials: ['SN-REAL-01'],
      performedBy: performer,
    });

    expect(() =>
      item.dispatchStock({
        movementId: 'mov-sale',
        warehouseId: 'WH-TECH',
        quantity: 1,
        serialNumbers: ['SN-INEXISTENTE'],
        performedBy: performer,
      })
    ).toThrow(SerialNumberNotFoundError);
  });

  it('debe permitir transicionar seriales a RESERVED, DAMAGED y regresar a stock', () => {
    let serial = new SerialNumber({
      serialNumber: 'SN-TEST-1',
      warehouseId: 'WH-1',
      cost,
    });

    expect(serial.isAvailable()).toBe(true);

    serial = serial.markAsReserved('RES-100');
    expect(serial.status).toBe('RESERVED');
    expect(serial.referenceId).toBe('RES-100');

    serial = serial.returnToStock();
    expect(serial.status).toBe('IN_STOCK');
    expect(serial.isAvailable()).toBe(true);

    serial = serial.markAsDamaged('Pantalla rota');
    expect(serial.status).toBe('DAMAGED');
    expect(serial.notes).toBe('Pantalla rota');
    expect(serial.isAvailable()).toBe(false);
  });
});
