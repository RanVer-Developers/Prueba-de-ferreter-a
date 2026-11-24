import { describe, expect, it } from 'vitest';
import {
  ABCClassificationService,
  InventoryItem,
  Money,
} from '../src/index.js';

describe('ABC Classification & Cycle Count Scheduling (Pareto)', () => {
  const performer = { id: 'usr-1', name: 'Analista de Inventario' };

  it('debe clasificar artículos en categorías A (80%), B (15%) y C (5%) según valor económico', () => {
    // Crear items con diferentes volúmenes y precios:
    // Item 1: Televisor 65" - 10 unidades @ $1,000 = $10,000 (Mayoría del valor)
    const itemTv = new InventoryItem({ id: 'i-tv', sku: 'TV-65', name: 'Smart TV 65"' });
    itemTv.receiveStock({ movementId: 'm1', warehouseId: 'WH-1', quantity: 10, unitCost: Money.fromDecimal(1000, 'USD'), performedBy: performer });

    // Item 2: Barra de Sonido - 8 unidades @ $150 = $1,200
    const itemSoundbar = new InventoryItem({ id: 'i-sb', sku: 'SB-100', name: 'Soundbar' });
    itemSoundbar.receiveStock({ movementId: 'm2', warehouseId: 'WH-1', quantity: 8, unitCost: Money.fromDecimal(150, 'USD'), performedBy: performer });

    // Item 3: Cable HDMI - 100 unidades @ $6 = $600
    const itemHdmi = new InventoryItem({ id: 'i-hdmi', sku: 'CAB-HDMI', name: 'Cable HDMI 2m' });
    itemHdmi.receiveStock({ movementId: 'm3', warehouseId: 'WH-1', quantity: 100, unitCost: Money.fromDecimal(6, 'USD'), performedBy: performer });

    // Item 4: Pilas AAA - 100 unidades @ $2 = $200
    const itemPilas = new InventoryItem({ id: 'i-pilas', sku: 'BAT-AAA', name: 'Pilas AAA x4' });
    itemPilas.receiveStock({ movementId: 'm4', warehouseId: 'WH-1', quantity: 100, unitCost: Money.fromDecimal(2, 'USD'), performedBy: performer });

    // Total inventario = 10,000 + 1,200 + 600 + 200 = $12,000 USD
    // TV: 10,000 / 12,000 = 83.3% -> Clase A
    // Soundbar: acum 93.3% -> Clase B (<= 95%)
    // Cable + Pilas -> Clase C (> 95%)

    const result = ABCClassificationService.analyze([itemTv, itemSoundbar, itemHdmi, itemPilas], 'WH-1');

    expect(result.totalInventoryValuation.toDecimal()).toBe(12000);
    expect(result.totalSkus).toBe(4);

    const tvClass = result.items.find((i) => i.sku === 'TV-65')!;
    expect(tvClass.abcClass).toBe('A');
    expect(tvClass.recommendedCountFrequencyDays).toBe(30); // Frecuencia alta para clase A

    const sbClass = result.items.find((i) => i.sku === 'SB-100')!;
    expect(sbClass.abcClass).toBe('B');
    expect(sbClass.recommendedCountFrequencyDays).toBe(90);

    const cableClass = result.items.find((i) => i.sku === 'CAB-HDMI')!;
    expect(cableClass.abcClass).toBe('C');
    expect(cableClass.recommendedCountFrequencyDays).toBe(180);
  });

  it('debe manejar listas vacías sin errores', () => {
    const emptyResult = ABCClassificationService.analyze([]);
    expect(emptyResult.totalSkus).toBe(0);
    expect(emptyResult.totalInventoryValuation.toDecimal()).toBe(0);
    expect(emptyResult.items.length).toBe(0);
  });
});
