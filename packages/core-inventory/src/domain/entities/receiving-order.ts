import {
  InvalidReceivingOrderStateError,
  ReceivingOverdeliveryError,
} from '../errors/inventory-errors.js';
import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { Money, MoneyJSON } from '../value-objects/money.js';
import { ReceivingOrderJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export type ReceivingOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ReceivingOrderItemProps {
  itemId: string;
  expectedQuantity: number;
  receivedQuantity?: number;
  unitCost: Money;
  notes?: string;
}

export interface ReceivingOrderItemJSON {
  itemId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  unitCost: MoneyJSON;
  notes?: string;
}

export interface ReceivingOrderProps {
  id: string;
  orderNumber: string;
  warehouseId: string;
  supplierId?: string;
  supplierName?: string;
  status?: ReceivingOrderStatus;
  items: ReceivingOrderItemProps[];
  createdAt?: Date;
  updatedAt?: Date;
  notes?: string;
}

export interface ReceivingOrderJSON {
  schemaVersion?: number;
  id: string;
  orderNumber: string;
  warehouseId: string;
  supplierId?: string;
  supplierName?: string;
  status: ReceivingOrderStatus;
  items: ReceivingOrderItemJSON[];
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

/**
 * Entidad Aggregate que modela órdenes de recepción en bodega y seguimiento de entregas parciales (Backorders).
 */
export class ReceivingOrder {
  public readonly id: string;
  public readonly orderNumber: string;
  public readonly warehouseId: string;
  public readonly supplierId?: string;
  public readonly supplierName?: string;
  public readonly status: ReceivingOrderStatus;
  private readonly _items: Map<string, ReceivingOrderItemProps>;
  public readonly createdAt: Date;
  public readonly updatedAt?: Date;
  public readonly notes?: string;

  constructor(props: ReceivingOrderProps) {
    this.id = props.id.trim();
    this.orderNumber = props.orderNumber.trim();
    this.warehouseId = props.warehouseId.trim();
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.status = props.status ?? 'DRAFT';
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.updatedAt = props.updatedAt ? new Date(props.updatedAt) : undefined;
    this.notes = props.notes;

    this._items = new Map();
    for (const item of props.items) {
      this._items.set(item.itemId, {
        ...item,
        receivedQuantity: item.receivedQuantity ?? 0,
      });
    }
  }

  public get items(): ReadonlyArray<
    ReceivingOrderItemProps & { pendingQuantity: number }
  > {
    return Array.from(this._items.values()).map((it) => ({
      ...it,
      receivedQuantity: it.receivedQuantity ?? 0,
      pendingQuantity: Math.max(0, it.expectedQuantity - (it.receivedQuantity ?? 0)),
    }));
  }

  public approve(): ReceivingOrder {
    if (this.status !== 'DRAFT') {
      throw new InvalidReceivingOrderStateError(this.id, this.status, 'Aprobar orden');
    }
    return new ReceivingOrder({
      ...this,
      status: 'APPROVED',
      updatedAt: new Date(),
      items: Array.from(this._items.values()),
    });
  }

  /**
   * Registra una recepción física parcial o total de un artículo en esta orden.
   */
  public receiveItem(params: {
    itemId: string;
    quantity: number;
    allowOverdelivery?: boolean;
    receivedAt?: Date;
  }): ReceivingOrder {
    if (this.status === 'CANCELLED' || this.status === 'COMPLETED') {
      throw new InvalidReceivingOrderStateError(this.id, this.status, 'Recepcionar entrega');
    }

    const currentItem = this._items.get(params.itemId);
    if (!currentItem) {
      throw new Error(`El artículo '${params.itemId}' no pertenece a la orden de recepción '${this.orderNumber}'.`);
    }

    const currentReceived = currentItem.receivedQuantity ?? 0;
    const pending = currentItem.expectedQuantity - currentReceived;

    if (params.quantity > pending && !params.allowOverdelivery) {
      throw new ReceivingOverdeliveryError(this.orderNumber, params.itemId, pending, params.quantity);
    }

    const updatedMap = new Map(this._items);
    updatedMap.set(params.itemId, {
      ...currentItem,
      receivedQuantity: currentReceived + params.quantity,
    });

    // Calcular estado global de la orden
    const allItems = Array.from(updatedMap.values());
    const allCompleted = allItems.every(
      (it) => (it.receivedQuantity ?? 0) >= it.expectedQuantity
    );

    const newStatus: ReceivingOrderStatus = allCompleted
      ? 'COMPLETED'
      : 'PARTIALLY_RECEIVED';

    return new ReceivingOrder({
      ...this,
      status: newStatus,
      updatedAt: params.receivedAt ?? new Date(),
      items: allItems,
    });
  }

  public cancel(reason: string): ReceivingOrder {
    if (this.status === 'COMPLETED') {
      throw new InvalidReceivingOrderStateError(this.id, this.status, 'Cancelar orden');
    }
    return new ReceivingOrder({
      ...this,
      status: 'CANCELLED',
      notes: reason,
      updatedAt: new Date(),
      items: Array.from(this._items.values()),
    });
  }

  public getPendingQuantity(itemId: string): number {
    const it = this._items.get(itemId);
    if (!it) return 0;
    return Math.max(0, it.expectedQuantity - (it.receivedQuantity ?? 0));
  }

  public isFullyReceived(): boolean {
    return Array.from(this._items.values()).every(
      (it) => (it.receivedQuantity ?? 0) >= it.expectedQuantity
    );
  }

  public toJSON(): ReceivingOrderJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      orderNumber: this.orderNumber,
      warehouseId: this.warehouseId,
      supplierId: this.supplierId,
      supplierName: this.supplierName,
      status: this.status,
      items: this.items.map((it) => ({
        itemId: it.itemId,
        expectedQuantity: it.expectedQuantity,
        receivedQuantity: it.receivedQuantity ?? 0,
        pendingQuantity: it.pendingQuantity,
        unitCost: it.unitCost.toJSON(),
        notes: it.notes,
      })),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt?.toISOString(),
      notes: this.notes,
    };
  }

  public static fromJSON(raw: ReceivingOrderJSON | unknown): ReceivingOrder {
    const json = parseWithInventorySchema(ReceivingOrderJSONSchema, raw, 'ReceivingOrder');
    return new ReceivingOrder({
      id: json.id,
      orderNumber: json.orderNumber,
      warehouseId: json.warehouseId,
      supplierId: json.supplierId,
      supplierName: json.supplierName,
      status: json.status,
      items: json.items.map((it) => ({
        itemId: it.itemId,
        expectedQuantity: it.expectedQuantity,
        receivedQuantity: it.receivedQuantity,
        unitCost: Money.fromJSON(it.unitCost),
        notes: it.notes,
      })),
      createdAt: new Date(json.createdAt),
      updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined,
      notes: json.notes,
    });
  }
}
