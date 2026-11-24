import { describe, expect, it } from 'vitest';
import {
  BOMExplosionService,
  CompositeProduct,
  InsufficientStockError,
  InventoryItem,
  Money,
} from '../src/index.js';

describe('Composite Products (BOM / Combos & Recetas)', () => {
  const performer = { id: 'usr-kitchen', name: 'Chef de Cocina' };
  const cost = Money.fromDecimal(1, 'USD');

  it('debe calcular la disponibilidad del combo en función del insumo cuello de botella', () => {
    // Definir Combo Hamburguesa:
    // 2 panes + 1 carne + 1 porción papas
    const combo = new CompositeProduct({
      compositeItemId: 'COMBO-BURGER',
      name: 'Combo Hamburguesa Clásica',
      components: [
        { itemId: 'INS-PAN', quantity: 2 },
        { itemId: 'INS-CARNE', quantity: 1 },
        { itemId: 'INS-PAPAS', quantity: 1 },
      ],
    });

    // Supongamos que en almacén hay:
    // - 20 panes (alcanza para 20 / 2 = 10 combos)
    // - 8 carnes (alcanza para 8 / 1 = 8 combos)
    // - 15 papas (alcanza para 15 / 1 = 15 combos)
    const stockMap: Record<string, number> = {
      'INS-PAN': 20,
      'INS-CARNE': 8,
      'INS-PAPAS': 15,
    };

    const availableCombos = combo.calculateAvailableQuantity((itemId) => stockMap[itemId] ?? 0);
    expect(availableCombos).toBe(8); // Limitado por la carne (8)
  });

  it('debe retornar 0 si alguno de los componentes indispensables no tiene existencia', () => {
    const combo = new CompositeProduct({
      compositeItemId: 'COMBO-PIZZA',
      name: 'Combo Pizza Familiar',
      components: [
        { itemId: 'INS-MASA', quantity: 1 },
        { itemId: 'INS-QUESO', quantity: 2 },
      ],
    });

    const stockMap: Record<string, number> = {
      'INS-MASA': 10,
      'INS-QUESO': 0, // Sin queso
    };

    const available = combo.calculateAvailableQuantity((itemId) => stockMap[itemId] ?? 0);
    expect(available).toBe(0);
  });

  it('debe validar disponibilidad con BOMExplosionService y lanzar InsufficientStockError si falta stock', () => {
    const itemPan = new InventoryItem({ id: 'INS-PAN', sku: 'PAN', name: 'Pan de Hamburguesa' });
    const itemCarne = new InventoryItem({ id: 'INS-CARNE', sku: 'CARNE', name: 'Carne de Res' });

    itemPan.receiveStock({ movementId: 'm1', warehouseId: 'WH-KITCHEN', quantity: 10, unitCost: cost, performedBy: performer });
    itemCarne.receiveStock({ movementId: 'm2', warehouseId: 'WH-KITCHEN', quantity: 2, unitCost: cost, performedBy: performer });

    const componentsMap = new Map<string, InventoryItem>([
      ['INS-PAN', itemPan],
      ['INS-CARNE', itemCarne],
    ]);

    const combo = new CompositeProduct({
      compositeItemId: 'COMBO-DOUBLE',
      name: 'Combo Doble Carne',
      components: [
        { itemId: 'INS-PAN', quantity: 2 },
        { itemId: 'INS-CARNE', quantity: 2 },
      ],
    });

    // 1 combo requiere 2 panes y 2 carnes -> hay 10 panes y 2 carnes -> 1 combo es posible
    const check1 = BOMExplosionService.verifyBOMAvailability(combo, 'WH-KITCHEN', 1, componentsMap);
    expect(check1.isAvailable).toBe(true);

    // 2 combos requieren 4 panes y 4 carnes -> solo hay 2 carnes -> no es posible
    const check2 = BOMExplosionService.verifyBOMAvailability(combo, 'WH-KITCHEN', 2, componentsMap);
    expect(check2.isAvailable).toBe(false);

    expect(() =>
      BOMExplosionService.ensureBOMAvailable(combo, 'WH-KITCHEN', 2, componentsMap)
    ).toThrow(InsufficientStockError);
  });
});
