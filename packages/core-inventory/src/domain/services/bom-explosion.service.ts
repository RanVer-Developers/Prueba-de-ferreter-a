import { CompositeProduct } from '../entities/composite-product.js';
import { InventoryItem } from '../entities/inventory-item.js';
import { InsufficientStockError } from '../errors/inventory-errors.js';

export interface ComponentRequirement {
  itemId: string;
  requiredQuantity: number;
  availableQuantity: number;
}

/**
 * Servicio de dominio para el cálculo de explosión de materiales (BOM) y combos.
 */
export class BOMExplosionService {
  /**
   * Verifica si hay existencias suficientes para ensamblar o despachar una cantidad de combos.
   */
  public static verifyBOMAvailability(
    composite: CompositeProduct,
    warehouseId: string,
    comboQuantity: number,
    componentItems: Map<string, InventoryItem>
  ): { isAvailable: boolean; requirements: ComponentRequirement[] } {
    const aggregatedRequired = new Map<string, number>();
    for (const comp of composite.components) {
      aggregatedRequired.set(
        comp.itemId,
        (aggregatedRequired.get(comp.itemId) ?? 0) + comp.quantity * comboQuantity
      );
    }

    const requirements: ComponentRequirement[] = [];
    let isAvailable = true;

    for (const [itemId, totalNeeded] of aggregatedRequired.entries()) {
      const item = componentItems.get(itemId);
      const available = item ? item.getAvailableStock(warehouseId) : 0;

      requirements.push({
        itemId,
        requiredQuantity: totalNeeded,
        availableQuantity: available,
      });

      if (available < totalNeeded) {
        isAvailable = false;
      }
    }

    return { isAvailable, requirements };
  }

  /**
   * Valida existencias y lanza excepción si algún componente no tiene stock suficiente.
   */
  public static ensureBOMAvailable(
    composite: CompositeProduct,
    warehouseId: string,
    comboQuantity: number,
    componentItems: Map<string, InventoryItem>
  ): void {
    const check = this.verifyBOMAvailability(composite, warehouseId, comboQuantity, componentItems);
    if (!check.isAvailable) {
      const failing = check.requirements.find((r) => r.availableQuantity < r.requiredQuantity);
      if (failing) {
        throw new InsufficientStockError(
          failing.itemId,
          warehouseId,
          failing.availableQuantity,
          failing.requiredQuantity
        );
      }
    }
  }
}
