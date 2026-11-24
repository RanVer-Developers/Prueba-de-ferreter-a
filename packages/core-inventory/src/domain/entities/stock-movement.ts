import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { Money, MoneyJSON } from '../value-objects/money.js';
import { StockMovementJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export enum StockMovementType {
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
  SALE_DISPATCH = 'SALE_DISPATCH',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  ADJUSTMENT_INCREASE = 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE = 'ADJUSTMENT_DECREASE',
  CUSTOMER_RETURN = 'CUSTOMER_RETURN',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  PRODUCTION_CONSUMPTION = 'PRODUCTION_CONSUMPTION',
  PRODUCTION_OUTPUT = 'PRODUCTION_OUTPUT',
  INITIAL_BALANCE = 'INITIAL_BALANCE',
}

export interface UserSummary {
  id: string;
  name: string;
  role?: string;
}

export interface StockMovementProps {
  id: string;
  itemId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: Money;
  totalCost: Money;
  referenceId?: string;
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  idempotencyKey?: string;
  createdAt?: Date;
}

export interface StockMovementJSON {
  schemaVersion?: number;
  id: string;
  itemId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: MoneyJSON;
  totalCost: MoneyJSON;
  referenceId?: string;
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  idempotencyKey?: string;
  createdAt: string;
}

/**
 * Entidad inmutable que representa un asiento en el Kardex contable de inventario.
 */
export class StockMovement {
  public readonly id: string;
  public readonly itemId: string;
  public readonly warehouseId: string;
  public readonly type: StockMovementType;
  public readonly quantity: number;
  public readonly balanceBefore: number;
  public readonly balanceAfter: number;
  public readonly unitCost: Money;
  public readonly totalCost: Money;
  public readonly referenceId?: string;
  public readonly lotNumber?: string;
  public readonly serialNumbers?: string[];
  public readonly performedBy: UserSummary;
  public readonly authorizedBy?: UserSummary;
  public readonly notes?: string;
  public readonly idempotencyKey?: string;
  public readonly createdAt: Date;

  constructor(props: StockMovementProps) {
    this.id = props.id;
    this.itemId = props.itemId;
    this.warehouseId = props.warehouseId;
    this.type = props.type;
    this.quantity = props.quantity;
    this.balanceBefore = props.balanceBefore;
    this.balanceAfter = props.balanceAfter;
    this.unitCost = props.unitCost;
    this.totalCost = props.totalCost;
    this.referenceId = props.referenceId;
    this.lotNumber = props.lotNumber;
    this.serialNumbers = props.serialNumbers ? [...props.serialNumbers] : undefined;
    this.performedBy = { ...props.performedBy };
    this.authorizedBy = props.authorizedBy ? { ...props.authorizedBy } : undefined;
    this.notes = props.notes;
    this.idempotencyKey = props.idempotencyKey;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
  }

  public toJSON(): StockMovementJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      itemId: this.itemId,
      warehouseId: this.warehouseId,
      type: this.type,
      quantity: this.quantity,
      balanceBefore: this.balanceBefore,
      balanceAfter: this.balanceAfter,
      unitCost: this.unitCost.toJSON(),
      totalCost: this.totalCost.toJSON(),
      referenceId: this.referenceId,
      lotNumber: this.lotNumber,
      serialNumbers: this.serialNumbers ? [...this.serialNumbers] : undefined,
      performedBy: { ...this.performedBy },
      authorizedBy: this.authorizedBy ? { ...this.authorizedBy } : undefined,
      notes: this.notes,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt.toISOString(),
    };
  }

  public static fromJSON(raw: StockMovementJSON | unknown): StockMovement {
    const json = parseWithInventorySchema(StockMovementJSONSchema, raw, 'StockMovement');
    return new StockMovement({
      id: json.id,
      itemId: json.itemId,
      warehouseId: json.warehouseId,
      type: json.type,
      quantity: json.quantity,
      balanceBefore: json.balanceBefore,
      balanceAfter: json.balanceAfter,
      unitCost: Money.fromJSON(json.unitCost),
      totalCost: Money.fromJSON(json.totalCost),
      referenceId: json.referenceId,
      lotNumber: json.lotNumber,
      serialNumbers: json.serialNumbers,
      performedBy: json.performedBy,
      authorizedBy: json.authorizedBy,
      notes: json.notes,
      idempotencyKey: json.idempotencyKey,
      createdAt: new Date(json.createdAt),
    });
  }
}
