import { LotExpiredError } from '../errors/inventory-errors.js';
import { Money, MoneyJSON } from './money.js';

export type LotStatus = 'ACTIVE' | 'QUARANTINED' | 'EXPIRED' | 'RECALLED';

export interface BatchLotProps {
  lotNumber: string;
  expirationDate: Date;
  manufacturingDate?: Date;
  status?: LotStatus;
  initialQuantity: number;
  currentQuantity: number;
  costPerUnit: Money;
}

export interface BatchLotJSON {
  lotNumber: string;
  expirationDate: string;
  manufacturingDate?: string;
  status: LotStatus;
  initialQuantity: number;
  currentQuantity: number;
  costPerUnit: MoneyJSON;
}

/**
 * Value Object / Sub-entidad inmutable para control de Lotes y Vencimientos (FEFO).
 */
export class BatchLot {
  public readonly lotNumber: string;
  public readonly expirationDate: Date;
  public readonly manufacturingDate?: Date;
  public readonly status: LotStatus;
  public readonly initialQuantity: number;
  public readonly currentQuantity: number;
  public readonly costPerUnit: Money;

  constructor(props: BatchLotProps) {
    this.lotNumber = props.lotNumber.trim();
    this.expirationDate = new Date(props.expirationDate);
    this.manufacturingDate = props.manufacturingDate ? new Date(props.manufacturingDate) : undefined;
    this.initialQuantity = props.initialQuantity;
    this.currentQuantity = props.currentQuantity;
    this.costPerUnit = props.costPerUnit;

    const isDateExpired = this.expirationDate.getTime() < Date.now();
    this.status = props.status ?? (isDateExpired ? 'EXPIRED' : 'ACTIVE');
  }

  public isExpired(referenceDate: Date = new Date()): boolean {
    return this.status === 'EXPIRED' || this.expirationDate.getTime() < referenceDate.getTime();
  }

  public daysUntilExpiration(referenceDate: Date = new Date()): number {
    const diffMs = this.expirationDate.getTime() - referenceDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  public isAvailableForDispatch(referenceDate: Date = new Date()): boolean {
    return this.status === 'ACTIVE' && !this.isExpired(referenceDate) && this.currentQuantity > 0;
  }

  /**
   * Descuenta cantidad del lote, validando que no esté vencido o en cuarentena.
   */
  public deduct(quantity: number, referenceDate: Date = new Date()): BatchLot {
    if (this.isExpired(referenceDate)) {
      throw new LotExpiredError(this.lotNumber, this.expirationDate);
    }
    const newQty = Math.max(0, this.currentQuantity - quantity);
    return new BatchLot({
      lotNumber: this.lotNumber,
      expirationDate: this.expirationDate,
      manufacturingDate: this.manufacturingDate,
      status: this.status,
      initialQuantity: this.initialQuantity,
      currentQuantity: newQty,
      costPerUnit: this.costPerUnit,
    });
  }

  public add(quantity: number): BatchLot {
    return new BatchLot({
      lotNumber: this.lotNumber,
      expirationDate: this.expirationDate,
      manufacturingDate: this.manufacturingDate,
      status: this.status,
      initialQuantity: this.initialQuantity + quantity,
      currentQuantity: this.currentQuantity + quantity,
      costPerUnit: this.costPerUnit,
    });
  }

  public withStatus(newStatus: LotStatus): BatchLot {
    return new BatchLot({
      lotNumber: this.lotNumber,
      expirationDate: this.expirationDate,
      manufacturingDate: this.manufacturingDate,
      status: newStatus,
      initialQuantity: this.initialQuantity,
      currentQuantity: this.currentQuantity,
      costPerUnit: this.costPerUnit,
    });
  }

  public toJSON(): BatchLotJSON {
    return {
      lotNumber: this.lotNumber,
      expirationDate: this.expirationDate.toISOString(),
      manufacturingDate: this.manufacturingDate?.toISOString(),
      status: this.status,
      initialQuantity: this.initialQuantity,
      currentQuantity: this.currentQuantity,
      costPerUnit: this.costPerUnit.toJSON(),
    };
  }

  public static fromJSON(json: BatchLotJSON): BatchLot {
    return new BatchLot({
      lotNumber: json.lotNumber,
      expirationDate: new Date(json.expirationDate),
      manufacturingDate: json.manufacturingDate ? new Date(json.manufacturingDate) : undefined,
      status: json.status,
      initialQuantity: json.initialQuantity,
      currentQuantity: json.currentQuantity,
      costPerUnit: Money.fromJSON(json.costPerUnit),
    });
  }
}
