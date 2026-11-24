import { InvalidSerialNumberStateError } from '../errors/inventory-errors.js';
import { Money, MoneyJSON } from './money.js';

export type SerialStatus =
  | 'IN_STOCK'
  | 'RESERVED'
  | 'SOLD'
  | 'RETURNED'
  | 'IN_TRANSIT'
  | 'DAMAGED'
  | 'LOST';

export interface SerialNumberProps {
  serialNumber: string;
  warehouseId: string;
  status?: SerialStatus;
  cost?: Money;
  registeredAt?: Date;
  referenceId?: string;
  notes?: string;
}

export interface SerialNumberJSON {
  serialNumber: string;
  warehouseId: string;
  status: SerialStatus;
  cost?: MoneyJSON;
  registeredAt: string;
  referenceId?: string;
  notes?: string;
}

/**
 * Value Object inmutable para control de números de serie individuales y trazabilidad unitaria.
 */
export class SerialNumber {
  public readonly serialNumber: string;
  public readonly warehouseId: string;
  public readonly status: SerialStatus;
  public readonly cost?: Money;
  public readonly registeredAt: Date;
  public readonly referenceId?: string;
  public readonly notes?: string;

  constructor(props: SerialNumberProps) {
    this.serialNumber = props.serialNumber.trim();
    this.warehouseId = props.warehouseId.trim();
    this.status = props.status ?? 'IN_STOCK';
    this.cost = props.cost;
    this.registeredAt = props.registeredAt ? new Date(props.registeredAt) : new Date();
    this.referenceId = props.referenceId;
    this.notes = props.notes;
  }

  public isAvailable(): boolean {
    return this.status === 'IN_STOCK';
  }

  public markAsReserved(referenceId: string): SerialNumber {
    if (this.status !== 'IN_STOCK') {
      throw new InvalidSerialNumberStateError(this.serialNumber, this.status, 'IN_STOCK');
    }
    return new SerialNumber({
      ...this,
      status: 'RESERVED',
      referenceId,
    });
  }

  public markAsSold(referenceId: string): SerialNumber {
    if (this.status !== 'IN_STOCK' && this.status !== 'RESERVED') {
      throw new InvalidSerialNumberStateError(this.serialNumber, this.status, 'IN_STOCK o RESERVED');
    }
    return new SerialNumber({
      ...this,
      status: 'SOLD',
      referenceId,
    });
  }

  public markAsInTransit(transferId: string): SerialNumber {
    if (this.status !== 'IN_STOCK') {
      throw new InvalidSerialNumberStateError(this.serialNumber, this.status, 'IN_STOCK');
    }
    return new SerialNumber({
      ...this,
      status: 'IN_TRANSIT',
      referenceId: transferId,
    });
  }

  public returnToStock(targetWarehouseId?: string): SerialNumber {
    return new SerialNumber({
      ...this,
      warehouseId: targetWarehouseId ?? this.warehouseId,
      status: 'IN_STOCK',
      referenceId: undefined,
    });
  }

  public markAsDamaged(reason: string): SerialNumber {
    return new SerialNumber({
      ...this,
      status: 'DAMAGED',
      notes: reason,
    });
  }

  public toJSON(): SerialNumberJSON {
    return {
      serialNumber: this.serialNumber,
      warehouseId: this.warehouseId,
      status: this.status,
      cost: this.cost?.toJSON(),
      registeredAt: this.registeredAt.toISOString(),
      referenceId: this.referenceId,
      notes: this.notes,
    };
  }

  public static fromJSON(json: SerialNumberJSON): SerialNumber {
    return new SerialNumber({
      serialNumber: json.serialNumber,
      warehouseId: json.warehouseId,
      status: json.status,
      cost: json.cost ? Money.fromJSON(json.cost) : undefined,
      registeredAt: new Date(json.registeredAt),
      referenceId: json.referenceId,
      notes: json.notes,
    });
  }
}
