import { Money, MoneyJSON } from './money.js';

export type ValuationMethod = 'FIFO' | 'WEIGHTED_AVERAGE' | 'STANDARD_COST';

export interface InventoryLayerProps {
  id: string;
  receivedAt: Date;
  quantity: number;
  remainingQuantity: number;
  unitCost: Money;
  referenceId?: string;
}

export interface InventoryLayerJSON {
  id: string;
  receivedAt: string;
  quantity: number;
  remainingQuantity: number;
  unitCost: MoneyJSON;
  referenceId?: string;
}

/**
 * Representa una capa contable de inventario para la valoración FIFO (PEPS).
 */
export class InventoryLayer {
  public readonly id: string;
  public readonly receivedAt: Date;
  public readonly quantity: number;
  public readonly remainingQuantity: number;
  public readonly unitCost: Money;
  public readonly referenceId?: string;

  constructor(props: InventoryLayerProps) {
    this.id = props.id;
    this.receivedAt = new Date(props.receivedAt);
    this.quantity = props.quantity;
    this.remainingQuantity = props.remainingQuantity;
    this.unitCost = props.unitCost;
  }

  public isDepleted(): boolean {
    return this.remainingQuantity <= 0;
  }

  public deduct(amount: number): { updatedLayer: InventoryLayer; deducted: number } {
    const toDeduct = Math.min(this.remainingQuantity, amount);
    const updated = new InventoryLayer({
      id: this.id,
      receivedAt: this.receivedAt,
      quantity: this.quantity,
      remainingQuantity: this.remainingQuantity - toDeduct,
      unitCost: this.unitCost,
      referenceId: this.referenceId,
    });
    return { updatedLayer: updated, deducted: toDeduct };
  }

  public toJSON(): InventoryLayerJSON {
    return {
      id: this.id,
      receivedAt: this.receivedAt.toISOString(),
      quantity: this.quantity,
      remainingQuantity: this.remainingQuantity,
      unitCost: this.unitCost.toJSON(),
      referenceId: this.referenceId,
    };
  }

  public static fromJSON(json: InventoryLayerJSON): InventoryLayer {
    return new InventoryLayer({
      id: json.id,
      receivedAt: new Date(json.receivedAt),
      quantity: json.quantity,
      remainingQuantity: json.remainingQuantity,
      unitCost: Money.fromJSON(json.unitCost),
      referenceId: json.referenceId,
    });
  }
}
