import { describe, expect, it } from 'vitest';
import { InventoryItem, Money, ValuationService } from '../src/index.js';

describe('Valuation Methods: FIFO & CMP (Weighted Average Cost)', () => {
  const performer = { id: 'usr-1', name: 'Contador' };

  describe('FIFO (First-In, First-Out / PEPS)', () => {
    it('debe valorizar salidas consumiendo las capas contables más antiguas primero', () => {
      const item = new InventoryItem({
        id: 'item-fifo',
        sku: 'SKU-OIL',
        name: 'Aceite de Oliva 1L',
        valuationMethod: 'FIFO',
      });

      // Capa 1: 10 unidades a $10 c/u ($100 total)
      item.receiveStock({
        movementId: 'mov-1',
        warehouseId: 'WH-1',
        quantity: 10,
        unitCost: Money.fromDecimal(10, 'USD'),
        performedBy: performer,
      });

      // Capa 2: 20 unidades a $15 c/u ($300 total)
      item.receiveStock({
        movementId: 'mov-2',
        warehouseId: 'WH-1',
        quantity: 20,
        unitCost: Money.fromDecimal(15, 'USD'),
        performedBy: performer,
      });

      // Existencia total: 30 unidades. Valorización total: 10*10 + 20*15 = $400 USD
      const valBefore = ValuationService.calculateItemValuation(item, 'WH-1');
      expect(valBefore.totalOnHandQuantity).toBe(30);
      expect(valBefore.totalValuation.toDecimal()).toBe(400);

      // Despacho 1: 15 unidades.
      // Debe consumir: 10 unidades de la Capa 1 ($10 c/u = $100) + 5 unidades de la Capa 2 ($15 c/u = $75)
      // Costo total del despacho: $175 USD
      const { movement, totalCost } = item.dispatchStock({
        movementId: 'mov-out-1',
        warehouseId: 'WH-1',
        quantity: 15,
        performedBy: performer,
      });

      expect(totalCost.toDecimal()).toBe(175);
      expect(movement.totalCost.toDecimal()).toBe(175);
      expect(item.getOnHandStock('WH-1')).toBe(15);

      // Existencia restante: 15 unidades a $15 c/u = $225 USD
      const valAfter = ValuationService.calculateItemValuation(item, 'WH-1');
      expect(valAfter.totalOnHandQuantity).toBe(15);
      expect(valAfter.totalValuation.toDecimal()).toBe(225);
    });
  });

  describe('CMP (Costo Medio Ponderado / Weighted Average Cost)', () => {
    it('debe recalcular continuamente el costo promedio con cada entrada de compra', () => {
      const item = new InventoryItem({
        id: 'item-cmp',
        sku: 'SKU-RICE',
        name: 'Arroz Grano Largo 1kg',
        valuationMethod: 'WEIGHTED_AVERAGE',
      });

      // Entrada 1: 100 unidades a $2.00 ($200.00 total)
      item.receiveStock({
        movementId: 'mov-1',
        warehouseId: 'WH-1',
        quantity: 100,
        unitCost: Money.fromDecimal(2.0, 'USD'),
        performedBy: performer,
      });

      expect(item.averageCost.toDecimal()).toBe(2.0);

      // Entrada 2: 100 unidades a $3.00 ($300.00 total)
      // Nuevo promedio: (200 + 300) / 200 = 500 / 200 = $2.50
      item.receiveStock({
        movementId: 'mov-2',
        warehouseId: 'WH-1',
        quantity: 100,
        unitCost: Money.fromDecimal(3.0, 'USD'),
        performedBy: performer,
      });

      expect(item.averageCost.toDecimal()).toBe(2.5);
      expect(item.getOnHandStock('WH-1')).toBe(200);

      // Despacho de 50 unidades al costo promedio ($2.50 * 50 = $125.00)
      const { totalCost } = item.dispatchStock({
        movementId: 'mov-out-1',
        warehouseId: 'WH-1',
        quantity: 50,
        performedBy: performer,
      });

      expect(totalCost.toDecimal()).toBe(125.0);
      expect(item.getOnHandStock('WH-1')).toBe(150);
      // El CMP sigue siendo $2.50 tras un despacho
      expect(item.averageCost.toDecimal()).toBe(2.5);

      // Entrada 3: 50 unidades a $4.00 ($200.00 total)
      // Existencia previa: 150 a $2.50 ($375.00). Nueva entrada: 50 a $4.00 ($200.00).
      // Total valor: 375 + 200 = $575.00. Total unidades: 200.
      // Nuevo promedio: 575 / 200 = 2.875 -> redondeo a centavos: $2.88
      item.receiveStock({
        movementId: 'mov-3',
        warehouseId: 'WH-1',
        quantity: 50,
        unitCost: Money.fromDecimal(4.0, 'USD'),
        performedBy: performer,
      });

      expect(item.averageCost.toDecimal()).toBe(2.88);
    });

    it('debe calcular la valorización global consolidada a través de múltiples almacenes', () => {
      const item = new InventoryItem({
        id: 'item-multi-val',
        sku: 'SKU-BEER',
        name: 'Cerveza Artesanal 330ml',
        valuationMethod: 'WEIGHTED_AVERAGE',
      });

      // Bodega 1: 100 unidades a $2.00
      item.receiveStock({
        movementId: 'm1',
        warehouseId: 'WH-1',
        quantity: 100,
        unitCost: Money.fromDecimal(2.0, 'USD'),
        performedBy: performer,
      });

      // Bodega 2: 50 unidades a $2.00
      item.receiveStock({
        movementId: 'm2',
        warehouseId: 'WH-2',
        quantity: 50,
        unitCost: Money.fromDecimal(2.0, 'USD'),
        performedBy: performer,
      });

      const globalValuation = ValuationService.calculateItemValuation(item);
      expect(globalValuation.totalOnHandQuantity).toBe(150);
      expect(globalValuation.totalValuation.toDecimal()).toBe(300.0);

      const wh1Valuation = ValuationService.calculateItemValuation(item, 'WH-1');
      expect(wh1Valuation.totalOnHandQuantity).toBe(100);
      expect(wh1Valuation.totalValuation.toDecimal()).toBe(200.0);
    });

    it('FIFO: debe valorizar correctamente cuando las capas se agotan totalmente', () => {
      const item = new InventoryItem({
        id: 'item-fifo-exhaust',
        sku: 'SKU-WINE',
        name: 'Vino Tinto Malbec',
        valuationMethod: 'FIFO',
      });

      item.receiveStock({
        movementId: 'm1',
        warehouseId: 'WH-1',
        quantity: 10,
        unitCost: Money.fromDecimal(15, 'USD'),
        performedBy: performer,
      });

      const { totalCost } = item.dispatchStock({
        movementId: 'm2',
        warehouseId: 'WH-1',
        quantity: 10,
        performedBy: performer,
      });

      expect(totalCost.toDecimal()).toBe(150);
      expect(item.getOnHandStock('WH-1')).toBe(0);

      const val = ValuationService.calculateItemValuation(item, 'WH-1');
      expect(val.totalOnHandQuantity).toBe(0);
      expect(val.totalValuation.toDecimal()).toBe(0);
    });
  });
});
