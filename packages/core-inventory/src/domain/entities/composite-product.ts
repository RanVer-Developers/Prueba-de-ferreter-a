import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { CompositeProductJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export interface BOMComponent {
  itemId: string;
  quantity: number;
}

export interface CompositeProductProps {
  compositeItemId: string;
  name: string;
  components: BOMComponent[];
}

export interface CompositeProductJSON {
  schemaVersion?: number;
  compositeItemId: string;
  name: string;
  components: BOMComponent[];
}

/**
 * Representa una receta, combo o kit (BOM - Bill of Materials).
 * Permite calcular disponibilidad en tiempo real según el insumo cuello de botella y explosión en ventas.
 */
export class CompositeProduct {
  public readonly compositeItemId: string;
  public readonly name: string;
  public readonly components: ReadonlyArray<BOMComponent>;

  constructor(props: CompositeProductProps) {
    this.compositeItemId = props.compositeItemId;
    this.name = props.name;
    this.components = props.components.map((c) => ({
      itemId: c.itemId,
      quantity: c.quantity,
    }));
  }

  /**
   * Calcula el stock disponible del combo en función del insumo más restrictivo (cuello de botella).
   */
  public calculateAvailableQuantity(getAvailableStock: (itemId: string) => number): number {
    if (this.components.length === 0) return 0;

    let minCombos = Infinity;
    for (const comp of this.components) {
      if (comp.quantity <= 0) continue;
      const stock = getAvailableStock(comp.itemId);
      const possibleWithThisComp = Math.floor(stock / comp.quantity);
      if (possibleWithThisComp < minCombos) {
        minCombos = possibleWithThisComp;
      }
    }
    return minCombos === Infinity ? 0 : Math.max(0, minCombos);
  }

  public toJSON(): CompositeProductJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      compositeItemId: this.compositeItemId,
      name: this.name,
      components: this.components.map((c) => ({ ...c })),
    };
  }

  public static fromJSON(raw: CompositeProductJSON | unknown): CompositeProduct {
    const json = parseWithInventorySchema(CompositeProductJSONSchema, raw, 'CompositeProduct');
    return new CompositeProduct(json);
  }
}
