import { InvalidTransferStateError, TransferMismatchError } from '../errors/inventory-errors.js';
import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { UserSummary } from './stock-movement.js';
import { StockTransferJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'COMPLETED' | 'DISCREPANCY' | 'CANCELLED';

export interface StockTransferProps {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  itemId: string;
  quantitySent: number;
  quantityReceived?: number;
  status?: TransferStatus;
  lotNumber?: string;
  serialNumbers?: string[];
  dispatchedAt?: Date;
  receivedAt?: Date;
  dispatchedBy?: UserSummary;
  receivedBy?: UserSummary;
  discrepancyReason?: string;
  notes?: string;
}

export interface StockTransferJSON {
  schemaVersion?: number;
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  itemId: string;
  quantitySent: number;
  quantityReceived?: number;
  status: TransferStatus;
  lotNumber?: string;
  serialNumbers?: string[];
  dispatchedAt?: string;
  receivedAt?: string;
  dispatchedBy?: UserSummary;
  receivedBy?: UserSummary;
  discrepancyReason?: string;
  notes?: string;
}

/**
 * Entidad Aggregate para gestionar traslados de mercancía entre almacenes con stock en tránsito.
 */
export class StockTransfer {
  public readonly id: string;
  public readonly fromWarehouseId: string;
  public readonly toWarehouseId: string;
  public readonly itemId: string;
  public readonly quantitySent: number;
  public readonly quantityReceived?: number;
  public readonly status: TransferStatus;
  public readonly lotNumber?: string;
  public readonly serialNumbers?: string[];
  public readonly dispatchedAt?: Date;
  public readonly receivedAt?: Date;
  public readonly dispatchedBy?: UserSummary;
  public readonly receivedBy?: UserSummary;
  public readonly discrepancyReason?: string;
  public readonly notes?: string;

  constructor(props: StockTransferProps) {
    this.id = props.id;
    this.fromWarehouseId = props.fromWarehouseId;
    this.toWarehouseId = props.toWarehouseId;
    this.itemId = props.itemId;
    this.quantitySent = props.quantitySent;
    this.quantityReceived = props.quantityReceived;
    this.status = props.status ?? 'DRAFT';
    this.lotNumber = props.lotNumber;
    this.serialNumbers = props.serialNumbers ? [...props.serialNumbers] : undefined;
    this.dispatchedAt = props.dispatchedAt ? new Date(props.dispatchedAt) : undefined;
    this.receivedAt = props.receivedAt ? new Date(props.receivedAt) : undefined;
    this.dispatchedBy = props.dispatchedBy ? { ...props.dispatchedBy } : undefined;
    this.receivedBy = props.receivedBy ? { ...props.receivedBy } : undefined;
    this.discrepancyReason = props.discrepancyReason;
    this.notes = props.notes;
  }

  public dispatch(dispatchedBy: UserSummary, dispatchedAt: Date = new Date()): StockTransfer {
    if (this.status !== 'DRAFT') {
      throw new InvalidTransferStateError(this.id, this.status, 'Despachar (IN_TRANSIT)');
    }
    return new StockTransfer({
      ...this,
      status: 'IN_TRANSIT',
      dispatchedBy: { ...dispatchedBy },
      dispatchedAt,
    });
  }

  public receive(
    receivedBy: UserSummary,
    quantityReceived: number,
    discrepancyReason?: string,
    receivedAt: Date = new Date()
  ): StockTransfer {
    if (this.status !== 'IN_TRANSIT') {
      throw new InvalidTransferStateError(this.id, this.status, 'Recibir (RECEIVE)');
    }
    if (quantityReceived < 0) {
      throw new TransferMismatchError(this.id, this.quantitySent, quantityReceived);
    }

    const hasDiscrepancy = quantityReceived !== this.quantitySent;
    const finalStatus: TransferStatus = hasDiscrepancy ? 'DISCREPANCY' : 'COMPLETED';

    return new StockTransfer({
      ...this,
      quantityReceived,
      status: finalStatus,
      receivedBy: { ...receivedBy },
      receivedAt,
      discrepancyReason: hasDiscrepancy ? discrepancyReason ?? 'Discrepancia de cantidades en recepción' : undefined,
    });
  }

  public cancel(reason: string): StockTransfer {
    if (this.status === 'COMPLETED' || this.status === 'DISCREPANCY') {
      throw new InvalidTransferStateError(this.id, this.status, 'Cancelar traslado');
    }
    return new StockTransfer({
      ...this,
      status: 'CANCELLED',
      discrepancyReason: reason,
    });
  }

  public toJSON(): StockTransferJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      fromWarehouseId: this.fromWarehouseId,
      toWarehouseId: this.toWarehouseId,
      itemId: this.itemId,
      quantitySent: this.quantitySent,
      quantityReceived: this.quantityReceived,
      status: this.status,
      lotNumber: this.lotNumber,
      serialNumbers: this.serialNumbers ? [...this.serialNumbers] : undefined,
      dispatchedAt: this.dispatchedAt?.toISOString(),
      receivedAt: this.receivedAt?.toISOString(),
      dispatchedBy: this.dispatchedBy ? { ...this.dispatchedBy } : undefined,
      receivedBy: this.receivedBy ? { ...this.receivedBy } : undefined,
      discrepancyReason: this.discrepancyReason,
      notes: this.notes,
    };
  }

  public static fromJSON(raw: StockTransferJSON | unknown): StockTransfer {
    const json = parseWithInventorySchema(StockTransferJSONSchema, raw, 'StockTransfer');
    return new StockTransfer({
      id: json.id,
      fromWarehouseId: json.fromWarehouseId,
      toWarehouseId: json.toWarehouseId,
      itemId: json.itemId,
      quantitySent: json.quantitySent,
      quantityReceived: json.quantityReceived,
      status: json.status,
      lotNumber: json.lotNumber,
      serialNumbers: json.serialNumbers,
      dispatchedAt: json.dispatchedAt ? new Date(json.dispatchedAt) : undefined,
      receivedAt: json.receivedAt ? new Date(json.receivedAt) : undefined,
      dispatchedBy: json.dispatchedBy,
      receivedBy: json.receivedBy,
      discrepancyReason: json.discrepancyReason,
      notes: json.notes,
    });
  }
}
