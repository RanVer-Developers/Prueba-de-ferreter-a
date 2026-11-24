import { describe, expect, it } from 'vitest';
import {
  BatchLot,
  InventoryItem,
  LotExpiredError,
  LotNotFoundError,
  Money,
  UnitOfMeasure,
} from '../src/index.js';

describe('BatchLot & FEFO Rotation', () => {
  const cost = Money.fromDecimal(10, 'USD');

  it('debe calcular días hasta el vencimiento e identificar lotes expirados', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // +10 días
    const lot = new BatchLot({
      lotNumber: 'LOT-A1',
      expirationDate: futureDate,
      initialQuantity: 100,
      currentQuantity: 100,
      costPerUnit: cost,
    });

    expect(lot.isExpired()).toBe(false);
    expect(lot.daysUntilExpiration()).toBeGreaterThanOrEqual(9);
    expect(lot.isAvailableForDispatch()).toBe(true);
  });

  it('debe impedir descontar de un lote vencido lanzando LotExpiredError', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // -1 día
    const expiredLot = new BatchLot({
      lotNumber: 'LOT-EXPIRED',
      expirationDate: pastDate,
      initialQuantity: 50,
      currentQuantity: 50,
      costPerUnit: cost,
    });

    expect(expiredLot.isExpired()).toBe(true);
    expect(() => expiredLot.deduct(10)).toThrow(LotExpiredError);
  });

  it('debe aplicar rotación FEFO automática seleccionando el lote más próximo a vencer', () => {
    const item = new InventoryItem({
      id: 'item-fefo-1',
      sku: 'SKU-MILK',
      name: 'Leche Fresca Entera 1L',
      trackingType: 'BATCH_LOT',
      uom: UnitOfMeasure.LITER,
    });

    const now = Date.now();
    const expDate1 = new Date(now + 5 * 24 * 60 * 60 * 1000); // Vence en 5 días
    const expDate2 = new Date(now + 15 * 24 * 60 * 60 * 1000); // Vence en 15 días
    const expDate3 = new Date(now + 30 * 24 * 60 * 60 * 1000); // Vence en 30 días

    const performer = { id: 'usr-1', name: 'Almacenero' };

    // Ingresar lote con vencimiento a 15 días (30 unidades)
    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-MAIN',
      quantity: 30,
      unitCost: cost,
      lotProps: { lotNumber: 'LOT-15D', expirationDate: expDate2, initialQuantity: 30, currentQuantity: 30 },
      performedBy: performer,
    });

    // Ingresar lote con vencimiento a 5 días (20 unidades) - Más próximo a vencer!
    item.receiveStock({
      movementId: 'mov-2',
      warehouseId: 'WH-MAIN',
      quantity: 20,
      unitCost: cost,
      lotProps: { lotNumber: 'LOT-05D', expirationDate: expDate1, initialQuantity: 20, currentQuantity: 20 },
      performedBy: performer,
    });

    // Ingresar lote con vencimiento a 30 días (50 unidades)
    item.receiveStock({
      movementId: 'mov-3',
      warehouseId: 'WH-MAIN',
      quantity: 50,
      unitCost: cost,
      lotProps: { lotNumber: 'LOT-30D', expirationDate: expDate3, initialQuantity: 50, currentQuantity: 50 },
      performedBy: performer,
    });

    expect(item.getOnHandStock('WH-MAIN')).toBe(100);

    // Despacho de 25 unidades sin especificar lote:
    // Debe consumir las 20 del lote que vence en 5 días (LOT-05D) y 5 del que vence en 15 días (LOT-15D)
    item.dispatchStock({
      movementId: 'mov-disp-1',
      warehouseId: 'WH-MAIN',
      quantity: 25,
      performedBy: performer,
    });

    const stock = item.getWarehouseStock('WH-MAIN')!;
    const lot05 = stock.lots.find((l) => l.lotNumber === 'LOT-05D')!;
    const lot15 = stock.lots.find((l) => l.lotNumber === 'LOT-15D')!;
    const lot30 = stock.lots.find((l) => l.lotNumber === 'LOT-30D')!;

    expect(lot05.currentQuantity).toBe(0); // Agotado primero
    expect(lot15.currentQuantity).toBe(25); // 30 - 5 = 25
    expect(lot30.currentQuantity).toBe(50); // Intacto
    expect(item.getOnHandStock('WH-MAIN')).toBe(75);
  });

  it('debe permitir despacho dirigido a un lote específico si se indica explícitamente', () => {
    const item = new InventoryItem({
      id: 'item-fefo-2',
      sku: 'SKU-YOGURT',
      name: 'Yogurt Griego 500g',
      trackingType: 'BATCH_LOT',
    });

    const performer = { id: 'usr-1', name: 'Almacenero' };
    const expDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    item.receiveStock({
      movementId: 'mov-1',
      warehouseId: 'WH-MAIN',
      quantity: 50,
      unitCost: cost,
      lotProps: { lotNumber: 'LOT-CUSTOM', expirationDate: expDate, initialQuantity: 50, currentQuantity: 50 },
      performedBy: performer,
    });

    item.dispatchStock({
      movementId: 'mov-2',
      warehouseId: 'WH-MAIN',
      quantity: 10,
      lotNumber: 'LOT-CUSTOM',
      performedBy: performer,
    });

    const stock = item.getWarehouseStock('WH-MAIN')!;
    const lot = stock.lots.find((l) => l.lotNumber === 'LOT-CUSTOM')!;
    expect(lot.currentQuantity).toBe(40);

    // Si se pide un lote inexistente, debe fallar
    expect(() =>
      item.dispatchStock({
        movementId: 'mov-3',
        warehouseId: 'WH-MAIN',
        quantity: 5,
        lotNumber: 'LOT-INEXISTENTE',
        performedBy: performer,
      })
    ).toThrow(LotNotFoundError);
  });

  it('debe permitir poner lotes en cuarentena y retirarlos de disponibilidad', () => {
    let lot = new BatchLot({
      lotNumber: 'LOT-QUAR',
      expirationDate: new Date(Date.now() + 100000000),
      initialQuantity: 100,
      currentQuantity: 100,
      costPerUnit: cost,
    });
    expect(lot.isAvailableForDispatch()).toBe(true);

    lot = lot.withStatus('QUARANTINED');
    expect(lot.status).toBe('QUARANTINED');
    expect(lot.isAvailableForDispatch()).toBe(false);

    lot = lot.withStatus('ACTIVE');
    expect(lot.isAvailableForDispatch()).toBe(true);
  });

  it('debe permitir sumar existencias a un lote y serializar en JSON sin pérdida', () => {
    let lot = new BatchLot({
      lotNumber: 'LOT-JSON',
      expirationDate: new Date('2028-12-31T00:00:00.000Z'),
      initialQuantity: 50,
      currentQuantity: 50,
      costPerUnit: cost,
    });

    lot = lot.add(25);
    expect(lot.currentQuantity).toBe(75);
    expect(lot.initialQuantity).toBe(75);

    const json = lot.toJSON();
    const restored = BatchLot.fromJSON(json);
    expect(restored.lotNumber).toBe('LOT-JSON');
    expect(restored.currentQuantity).toBe(75);
    expect(restored.costPerUnit.equals(cost)).toBe(true);
  });
});
