import { describe, expect, it } from 'vitest';
import {
  InventoryCount,
  InventoryCountClosedError,
  Money,
  SelfApprovalNotAllowedError,
} from '../src/index.js';

describe('Inventory Count (Toma Física & Conteo Ciego)', () => {
  const cost = Money.fromDecimal(20, 'USD');

  it('debe registrar conteos y calcular discrepancias de cantidad y valor', () => {
    let count = new InventoryCount({
      id: 'COUNT-01',
      warehouseId: 'WH-STORE',
      name: 'Auditoría Mensual Pasillo 1',
      isBlind: false,
    });

    // En sistema había 10, pero se contaron 8 físicamente (faltante -2)
    count = count.recordCount({
      itemId: 'ITEM-1',
      systemQuantity: 10,
      countedQuantity: 8,
      unitCost: cost,
      countedBy: 'Auditor Juan',
    });

    // En sistema había 5, pero se contaron 7 físicamente (sobrante +2)
    count = count.recordCount({
      itemId: 'ITEM-2',
      systemQuantity: 5,
      countedQuantity: 7,
      unitCost: cost,
      countedBy: 'Auditor Juan',
    });

    expect(count.items.length).toBe(2);
    const item1 = count.items.find((i) => i.itemId === 'ITEM-1')!;
    const item2 = count.items.find((i) => i.itemId === 'ITEM-2')!;

    expect(item1.difference).toBe(-2);
    expect(item1.differenceValue.toDecimal()).toBe(-40); // -2 * $20 = -$40 USD

    expect(item2.difference).toBe(2);
    expect(item2.differenceValue.toDecimal()).toBe(40); // +2 * $20 = +$40 USD

    expect(count.getTotalDiscrepancyQuantity()).toBe(4); // |-2| + |2| = 4 unidades con discrepancia
    expect(count.getTotalDiscrepancyValue().toDecimal()).toBe(0); // -$40 + $40 = $0 neto
  });

  it('debe ocultar cantidades teóricas en la vista del operador si es Conteo Ciego (Blind Count)', () => {
    let blindCount = new InventoryCount({
      id: 'COUNT-BLIND',
      warehouseId: 'WH-STORE',
      name: 'Conteo Ciego de Cierre',
      isBlind: true,
    });

    blindCount = blindCount.recordCount({
      itemId: 'ITEM-SECRET',
      systemQuantity: 50,
      countedQuantity: 48,
      unitCost: cost,
      countedBy: 'Operario',
    });

    const operatorView = blindCount.toOperatorView();
    expect(operatorView.isBlind).toBe(true);
    expect(operatorView.items[0].countedQuantity).toBe(48);
    // Verificar que en la vista del operador no existen systemQuantity ni difference
    expect((operatorView.items[0] as any).systemQuantity).toBeUndefined();
    expect((operatorView.items[0] as any).difference).toBeUndefined();
  });

  it('debe prohibir la autoaprobación de diferencias en reconciliación', () => {
    let count = new InventoryCount({
      id: 'COUNT-AUDIT',
      warehouseId: 'WH-STORE',
      name: 'Auditoría Anual',
    });

    count = count.recordCount({
      itemId: 'ITEM-A',
      systemQuantity: 10,
      countedQuantity: 5, // Faltante de 5
      unitCost: cost,
      countedBy: 'Auditor',
    });

    const auditor = { id: 'usr-same', name: 'Laura Gómez', role: 'AUDITOR' };

    // Si el mismo usuario que reconcilia intenta ser el supervisor autorizador
    expect(() => count.reconcile(auditor, auditor)).toThrow(SelfApprovalNotAllowedError);
  });

  it('debe impedir registrar conteos una vez reconciliada la sesión', () => {
    let count = new InventoryCount({
      id: 'COUNT-CLOSED',
      warehouseId: 'WH-STORE',
      name: 'Auditoría Cerrada',
    });

    count = count.recordCount({
      itemId: 'ITEM-B',
      systemQuantity: 10,
      countedQuantity: 10,
      unitCost: cost,
      countedBy: 'Auditor',
    });

    count = count.reconcile({ id: 'usr-rec', name: 'Reconciliador' });
    expect(count.status).toBe('RECONCILED');

    expect(() =>
      count.recordCount({
        itemId: 'ITEM-C',
        systemQuantity: 5,
        countedQuantity: 5,
        unitCost: cost,
        countedBy: 'Auditor',
      })
    ).toThrow(InventoryCountClosedError);
  });
});
