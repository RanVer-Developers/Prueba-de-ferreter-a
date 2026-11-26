import { describe, expect, it } from 'vitest';
import {
  BinLocation,
  ExpireLotsUseCase,
  FeatureDisabledError,
  GetReplenishmentSuggestionsUseCase,
  InMemoryInventoryRepository,
  InventoryItem,
  Money,
  SelectCycleCountItemsUseCase,
} from '../src/index.js';

describe('@modulos/core-inventory: Flagged Enhancements (Replenishment, Auto-Expire, Cycle Count)', () => {
  it('computes replenishment suggestions factoring in available and in-transit stock', async () => {
    const repo = new InMemoryInventoryRepository();
    const itemA = new InventoryItem({
      id: 'item-a',
      sku: 'SKU-A',
      name: 'Tornillo',
      reorderRules: { minStock: 20, reorderPoint: 30, maxStock: 100 },
    });
    itemA.receiveStock({
      movementId: 'm1',
      warehouseId: 'WH-1',
      quantity: 10,
      unitCost: Money.fromDecimal(1, 'MXN'),
      performedBy: { id: 'u1', name: 'Op' },
    });
    await repo.save(itemA);

    const itemB = new InventoryItem({
      id: 'item-b',
      sku: 'SKU-B',
      name: 'Tuerca',
      reorderRules: { minStock: 10, reorderPoint: 20, maxStock: 50 },
    });
    itemB.receiveStock({
      movementId: 'm2',
      warehouseId: 'WH-1',
      quantity: 40,
      unitCost: Money.fromDecimal(1, 'MXN'),
      performedBy: { id: 'u1', name: 'Op' },
    });
    await repo.save(itemB);

    const ucBasic = new GetReplenishmentSuggestionsUseCase(repo, 'BASIC');
    await expect(ucBasic.execute()).rejects.toThrow(FeatureDisabledError);

    const ucAdv = new GetReplenishmentSuggestionsUseCase(repo, 'ADVANCED');
    const suggestions = await ucAdv.execute({ warehouseId: 'WH-1' });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.itemId).toBe('item-a');
    expect(suggestions[0]?.suggestedOrderQuantity).toBe(90);
    expect(suggestions[0]?.urgency).toBe('BELOW_MIN');
  });

  it('auto-expires past-due active lots and selects cycle count items by ABC/aisle', async () => {
    const repo = new InMemoryInventoryRepository();
    const itemLot = new InventoryItem({
      id: 'item-lot',
      sku: 'SKU-LOT',
      name: 'Leche',
      trackingType: 'BATCH_LOT',
    });
    itemLot.receiveStock({
      movementId: 'm-lot',
      warehouseId: 'WH-1',
      quantity: 25,
      unitCost: Money.fromDecimal(20, 'MXN'),
      lotProps: {
        lotNumber: 'LOT-EXP',
        expirationDate: new Date('2026-11-25T00:00:00.000Z'),
        initialQuantity: 25,
        currentQuantity: 25,
      },
      receivedAt: new Date('2026-11-18T00:00:00.000Z'),
      performedBy: { id: 'u1', name: 'Op' },
    });
    itemLot.assignBinLocation(
      'WH-1',
      new BinLocation({ aisle: 'A1', rack: 'R1', shelf: 'S1', bin: 'B1' })
    );
    await repo.save(itemLot);

    const expireUc = new ExpireLotsUseCase(repo, undefined, 'ADVANCED');
    const expired = await expireUc.execute({
      warehouseId: 'WH-1',
      referenceDate: new Date('2026-11-30T00:00:00.000Z'),
    });
    expect(expired).toHaveLength(1);
    expect(expired[0]?.lotNumber).toBe('LOT-EXP');

    const reloaded = (await repo.findById('item-lot'))!;
    expect(reloaded.getWarehouseStock('WH-1')?.lots[0]?.status).toBe('EXPIRED');

    const cycleUc = new SelectCycleCountItemsUseCase(repo, 'ADVANCED');
    const selected = await cycleUc.execute({
      warehouseId: 'WH-1',
      aisle: 'A1',
      targetClasses: ['A'],
    });
    expect(selected.map((i) => i.id)).toEqual(['item-lot']);
  });
});
