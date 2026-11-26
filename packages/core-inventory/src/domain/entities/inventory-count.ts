import {
  InventoryCountClosedError,
  SelfApprovalNotAllowedError,
} from '../errors/inventory-errors.js';
import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { Money, MoneyJSON } from '../value-objects/money.js';
import { UserSummary } from './stock-movement.js';
import { InventoryCountJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export type InventoryCountStatus = 'OPEN' | 'RECONCILED' | 'CANCELLED';

export interface CountItemProps {
  itemId: string;
  systemQuantity: number;
  countedQuantity: number;
  unitCost: Money;
  countedBy: string;
  notes?: string;
}

export interface CountItemJSON {
  itemId: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unitCost: MoneyJSON;
  differenceValue: MoneyJSON;
  countedBy: string;
  notes?: string;
}

export interface CountItemOperatorView {
  itemId: string;
  countedQuantity: number;
  countedBy: string;
  notes?: string;
}

export interface InventoryCountProps {
  id: string;
  warehouseId: string;
  name: string;
  isBlind?: boolean;
  status?: InventoryCountStatus;
  items?: CountItemProps[];
  createdAt?: Date;
  reconciledAt?: Date;
  reconciledBy?: UserSummary;
  authorizedBy?: UserSummary;
}

export interface InventoryCountJSON {
  schemaVersion?: number;
  id: string;
  warehouseId: string;
  name: string;
  isBlind: boolean;
  status: InventoryCountStatus;
  items: CountItemJSON[];
  createdAt: string;
  reconciledAt?: string;
  reconciledBy?: UserSummary;
  authorizedBy?: UserSummary;
}

/**
 * Entidad Aggregate para arqueo físico de existencias con soporte de conteo ciego (Blind Count).
 */
export class InventoryCount {
  public readonly id: string;
  public readonly warehouseId: string;
  public readonly name: string;
  public readonly isBlind: boolean;
  public readonly status: InventoryCountStatus;
  private readonly _items: Map<string, CountItemProps>;
  public readonly createdAt: Date;
  public readonly reconciledAt?: Date;
  public readonly reconciledBy?: UserSummary;
  public readonly authorizedBy?: UserSummary;

  constructor(props: InventoryCountProps) {
    this.id = props.id;
    this.warehouseId = props.warehouseId;
    this.name = props.name;
    this.isBlind = props.isBlind ?? false;
    this.status = props.status ?? 'OPEN';
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
    this.reconciledAt = props.reconciledAt ? new Date(props.reconciledAt) : undefined;
    this.reconciledBy = props.reconciledBy ? { ...props.reconciledBy } : undefined;
    this.authorizedBy = props.authorizedBy ? { ...props.authorizedBy } : undefined;

    this._items = new Map();
    if (props.items) {
      for (const item of props.items) {
        this._items.set(item.itemId, { ...item });
      }
    }
  }

  public get items(): ReadonlyArray<CountItemProps & { difference: number; differenceValue: Money }> {
    return Array.from(this._items.values()).map((it) => {
      const diff = it.countedQuantity - it.systemQuantity;
      const diffValue = it.unitCost.multiply(diff);
      return {
        ...it,
        difference: diff,
        differenceValue: diffValue,
      };
    });
  }

  public recordCount(item: CountItemProps): InventoryCount {
    if (this.status !== 'OPEN') {
      throw new InventoryCountClosedError(this.id);
    }
    const updatedMap = new Map(this._items);
    updatedMap.set(item.itemId, { ...item });

    return new InventoryCount({
      ...this,
      items: Array.from(updatedMap.values()),
    });
  }

  public reconcile(
    reconciledBy: UserSummary,
    authorizedBy?: UserSummary,
    reconciledAt: Date = new Date()
  ): InventoryCount {
    if (this.status !== 'OPEN') {
      throw new InventoryCountClosedError(this.id);
    }

    // Regla de control interno: evitar auto-aprobación si hay discrepancias
    const hasDiscrepancies = this.items.some((it) => it.difference !== 0);
    if (hasDiscrepancies && authorizedBy && reconciledBy.id === authorizedBy.id) {
      throw new SelfApprovalNotAllowedError(reconciledBy.id, 'Reconciliar toma física con discrepancias');
    }

    return new InventoryCount({
      ...this,
      status: 'RECONCILED',
      reconciledBy: { ...reconciledBy },
      authorizedBy: authorizedBy ? { ...authorizedBy } : undefined,
      reconciledAt,
      items: Array.from(this._items.values()),
    });
  }

  /**
   * Vista segura de auditoría: si es conteo ciego, oculta cantidades del sistema y diferencias.
   */
  public toOperatorView(): {
    id: string;
    warehouseId: string;
    name: string;
    isBlind: boolean;
    status: InventoryCountStatus;
    items: CountItemOperatorView[];
  } {
    return {
      id: this.id,
      warehouseId: this.warehouseId,
      name: this.name,
      isBlind: this.isBlind,
      status: this.status,
      items: Array.from(this._items.values()).map((it) => ({
        itemId: it.itemId,
        countedQuantity: it.countedQuantity,
        countedBy: it.countedBy,
        notes: it.notes,
      })),
    };
  }

  public getTotalDiscrepancyQuantity(): number {
    return this.items.reduce((acc, it) => acc + Math.abs(it.difference), 0);
  }

  public getTotalDiscrepancyValue(): Money {
    const currency = this.items[0]?.unitCost.currency ?? 'USD';
    let totalCents = 0;
    for (const item of this.items) {
      totalCents += item.differenceValue.toCents();
    }
    return Money.fromCents(totalCents, currency);
  }

  public toJSON(): InventoryCountJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      warehouseId: this.warehouseId,
      name: this.name,
      isBlind: this.isBlind,
      status: this.status,
      items: this.items.map((it) => ({
        itemId: it.itemId,
        systemQuantity: it.systemQuantity,
        countedQuantity: it.countedQuantity,
        difference: it.difference,
        unitCost: it.unitCost.toJSON(),
        differenceValue: it.differenceValue.toJSON(),
        countedBy: it.countedBy,
        notes: it.notes,
      })),
      createdAt: this.createdAt.toISOString(),
      reconciledAt: this.reconciledAt?.toISOString(),
      reconciledBy: this.reconciledBy ? { ...this.reconciledBy } : undefined,
      authorizedBy: this.authorizedBy ? { ...this.authorizedBy } : undefined,
    };
  }

  public static fromJSON(raw: InventoryCountJSON | unknown): InventoryCount {
    const json = parseWithInventorySchema(InventoryCountJSONSchema, raw, 'InventoryCount');
    return new InventoryCount({
      id: json.id,
      warehouseId: json.warehouseId,
      name: json.name,
      isBlind: json.isBlind,
      status: json.status,
      items: json.items.map((it) => ({
        itemId: it.itemId,
        systemQuantity: it.systemQuantity,
        countedQuantity: it.countedQuantity,
        unitCost: Money.fromJSON(it.unitCost),
        countedBy: it.countedBy,
        notes: it.notes,
      })),
      createdAt: new Date(json.createdAt),
      reconciledAt: json.reconciledAt ? new Date(json.reconciledAt) : undefined,
      reconciledBy: json.reconciledBy,
      authorizedBy: json.authorizedBy,
    });
  }
}
