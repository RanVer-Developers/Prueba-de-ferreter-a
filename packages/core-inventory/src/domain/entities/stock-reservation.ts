import { ReservationExpiredError } from '../errors/inventory-errors.js';
import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { StockReservationJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export type ReservationStatus = 'ACTIVE' | 'COMMITTED' | 'RELEASED' | 'EXPIRED';

export interface StockReservationProps {
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  referenceId: string;
  expiresAt: Date;
  status?: ReservationStatus;
  serialNumbers?: string[];
  createdAt?: Date;
}

export interface StockReservationJSON {
  schemaVersion?: number;
  id: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
  referenceId: string;
  expiresAt: string;
  status: ReservationStatus;
  serialNumbers?: string[];
  createdAt: string;
}

/**
 * Entidad que gestiona reservas temporales de stock con tiempo de vida (TTL) para apartados y carritos.
 */
export class StockReservation {
  public readonly id: string;
  public readonly itemId: string;
  public readonly warehouseId: string;
  public readonly quantity: number;
  public readonly referenceId: string;
  public readonly expiresAt: Date;
  public readonly status: ReservationStatus;
  public readonly serialNumbers?: string[];
  public readonly createdAt: Date;

  constructor(props: StockReservationProps) {
    this.id = props.id;
    this.itemId = props.itemId;
    this.warehouseId = props.warehouseId;
    this.quantity = props.quantity;
    this.referenceId = props.referenceId;
    this.expiresAt = new Date(props.expiresAt);
    this.status = props.status ?? 'ACTIVE';
    this.serialNumbers = props.serialNumbers ? [...props.serialNumbers] : undefined;
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();
  }

  public isExpired(referenceDate: Date = new Date()): boolean {
    return this.status === 'EXPIRED' || (this.status === 'ACTIVE' && this.expiresAt.getTime() < referenceDate.getTime());
  }

  public commit(referenceDate: Date = new Date()): StockReservation {
    if (this.isExpired(referenceDate)) {
      throw new ReservationExpiredError(this.id, this.expiresAt);
    }
    return new StockReservation({
      ...this,
      status: 'COMMITTED',
    });
  }

  public release(): StockReservation {
    return new StockReservation({
      ...this,
      status: 'RELEASED',
    });
  }

  public expire(): StockReservation {
    return new StockReservation({
      ...this,
      status: 'EXPIRED',
    });
  }

  public toJSON(): StockReservationJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      itemId: this.itemId,
      warehouseId: this.warehouseId,
      quantity: this.quantity,
      referenceId: this.referenceId,
      expiresAt: this.expiresAt.toISOString(),
      status: this.status,
      serialNumbers: this.serialNumbers ? [...this.serialNumbers] : undefined,
      createdAt: this.createdAt.toISOString(),
    };
  }

  public static fromJSON(raw: StockReservationJSON | unknown): StockReservation {
    const json = parseWithInventorySchema(StockReservationJSONSchema, raw, 'StockReservation');
    return new StockReservation({
      id: json.id,
      itemId: json.itemId,
      warehouseId: json.warehouseId,
      quantity: json.quantity,
      referenceId: json.referenceId,
      expiresAt: new Date(json.expiresAt),
      status: json.status,
      serialNumbers: json.serialNumbers,
      createdAt: new Date(json.createdAt),
    });
  }
}
