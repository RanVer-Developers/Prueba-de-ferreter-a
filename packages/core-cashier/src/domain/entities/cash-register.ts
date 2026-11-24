import {
  CashRegisterAlreadyOpenError,
  CashRegisterNotOpenError,
  CurrencyMismatchError,
  InvalidCashierInputError,
  InvalidCashRegisterStatusError,
  InvalidMoneyAmountError,
} from '../errors/cashier-errors.js';
import { CashBreakdown, CashBreakdownJSON } from '../value-objects/cash-denomination.js';
import { Money } from '../value-objects/money.js';
import {
  CASHIER_SCHEMA_VERSION,
  CashRegisterJSONSchema,
  parseWithCashierSchema,
} from '../../schemas/cashier.schemas.js';

export enum CashRegisterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

export interface CashRegisterProps {
  id: string;
  name: string;
  branchId?: string;
  currency?: string;
  status?: CashRegisterStatus;
  activeShiftId?: string | null;
  maxCashThreshold?: Money;
  carryOverFloat?: Money;
  carryOverBreakdown?: CashBreakdown;
  lastZReportNumber?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CashRegisterJSON {
  schemaVersion?: number;
  id: string;
  name: string;
  branchId?: string;
  currency: string;
  status: CashRegisterStatus;
  activeShiftId: string | null;
  maxCashThreshold?: number;
  carryOverFloat?: number;
  carryOverBreakdown?: CashBreakdownJSON;
  lastZReportNumber: number;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Entidad que representa una Caja o Terminal de cobro física/virtual.
 */
export class CashRegister {
  public readonly id: string;
  public name: string;
  public branchId?: string;
  public readonly currency: string;
  private _status: CashRegisterStatus;
  private _activeShiftId: string | null;
  public maxCashThreshold?: Money;
  private _carryOverFloat?: Money;
  private _carryOverBreakdown?: CashBreakdown;
  private _lastZReportNumber: number;
  public readonly createdAt: Date;
  public updatedAt: Date;

  public constructor(props: CashRegisterProps) {
    this.id = props.id.trim();
    this.name = props.name.trim();
    this.branchId = props.branchId;
    this.currency = (props.currency || 'USD').toUpperCase().trim();
    this._status = props.status || CashRegisterStatus.ACTIVE;
    this._activeShiftId = props.activeShiftId || null;

    if (props.maxCashThreshold) {
      if (props.maxCashThreshold.currency !== this.currency) {
        throw new CurrencyMismatchError(this.currency, props.maxCashThreshold.currency);
      }
      this.maxCashThreshold = props.maxCashThreshold;
    }

    if (props.carryOverFloat) {
      if (props.carryOverFloat.currency !== this.currency) {
        throw new CurrencyMismatchError(this.currency, props.carryOverFloat.currency);
      }
      this._carryOverFloat = props.carryOverFloat.isPositive() ? props.carryOverFloat : undefined;
    }

    if (props.carryOverBreakdown) {
      if (props.carryOverBreakdown.currency !== this.currency) {
        throw new CurrencyMismatchError(this.currency, props.carryOverBreakdown.currency);
      }
      this._carryOverBreakdown = props.carryOverBreakdown;
    }

    this._lastZReportNumber = props.lastZReportNumber ?? 0;

    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  /**
   * Reconstruye una caja desde su JSON (rehidratación).
   */
  public static fromJSON(raw: CashRegisterJSON | unknown): CashRegister {
    const json = parseWithCashierSchema(CashRegisterJSONSchema, raw, 'CashRegister');
    return new CashRegister({
      id: json.id,
      name: json.name,
      branchId: json.branchId,
      currency: json.currency,
      status: json.status || CashRegisterStatus.ACTIVE,
      activeShiftId: json.activeShiftId,
      maxCashThreshold: json.maxCashThreshold !== undefined ? Money.fromDecimal(json.maxCashThreshold, json.currency) : undefined,
      carryOverFloat: json.carryOverFloat !== undefined ? Money.fromDecimal(json.carryOverFloat, json.currency) : undefined,
      carryOverBreakdown: json.carryOverBreakdown ? CashBreakdown.fromJSON(json.carryOverBreakdown) : undefined,
      lastZReportNumber: json.lastZReportNumber,
      createdAt: new Date(json.createdAt),
      updatedAt: new Date(json.updatedAt),
    });
  }

  /**
   * Fondo fijo retenido en el último cierre, disponible como fondo de apertura del siguiente turno.
   */
  public get carryOverFloat(): Money | undefined {
    return this._carryOverFloat;
  }

  /**
   * Desglose físico de billetes y monedas retenido en el último cierre.
   */
  public get carryOverBreakdown(): CashBreakdown | undefined {
    return this._carryOverBreakdown;
  }

  public get lastZReportNumber(): number {
    return this._lastZReportNumber;
  }

  public setCarryOverFloat(amount?: Money, breakdown?: CashBreakdown): void {
    if (amount && amount.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, amount.currency);
    }
    if (breakdown && breakdown.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, breakdown.currency);
    }
    if (amount && breakdown && !breakdown.calculateTotal().equals(amount)) {
      throw new InvalidMoneyAmountError(
        breakdown.calculateTotal().toDecimal(),
        `El desglose de fondo retenido (${breakdown.calculateTotal().toString()}) no coincide con el monto (${amount.toString()}).`
      );
    }
    this._carryOverFloat = amount && amount.isPositive() ? amount : undefined;
    this._carryOverBreakdown = amount && amount.isPositive() ? breakdown : undefined;
    this.updatedAt = new Date();
  }

  public clearCarryOverFloat(): void {
    this.setCarryOverFloat(undefined, undefined);
  }

  /**
   * Asigna el siguiente número consecutivo de reporte Z de esta caja.
   */
  public allocateZReportNumber(): number {
    this._lastZReportNumber += 1;
    this.updatedAt = new Date();
    return this._lastZReportNumber;
  }

  public get status(): CashRegisterStatus {
    return this._status;
  }

  public isActive(): boolean {
    return this._status === CashRegisterStatus.ACTIVE;
  }

  public activate(): void {
    this._status = CashRegisterStatus.ACTIVE;
    this.updatedAt = new Date();
  }

  public deactivate(): void {
    if (this.isOpen()) {
      throw new CashRegisterAlreadyOpenError(this.id, this._activeShiftId!);
    }
    this._status = CashRegisterStatus.INACTIVE;
    this.updatedAt = new Date();
  }

  public setMaintenance(): void {
    if (this.isOpen()) {
      throw new CashRegisterAlreadyOpenError(this.id, this._activeShiftId!);
    }
    this._status = CashRegisterStatus.MAINTENANCE;
    this.updatedAt = new Date();
  }

  public rename(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new InvalidCashierInputError('El nombre de la caja registradora no puede estar vacío.');
    }
    this.name = trimmed;
    this.updatedAt = new Date();
  }

  public setMaxCashThreshold(threshold?: Money): void {
    if (threshold && threshold.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, threshold.currency);
    }
    this.maxCashThreshold = threshold;
    this.updatedAt = new Date();
  }

  public get activeShiftId(): string | null {
    return this._activeShiftId;
  }

  public isOpen(): boolean {
    return this._activeShiftId !== null;
  }

  public assignShift(shiftId: string): void {
    if (!this.isActive()) {
      throw new InvalidCashRegisterStatusError(this.id, this._status, 'Solo se puede abrir turno en una caja ACTIVE.');
    }
    if (this.isOpen()) {
      throw new CashRegisterAlreadyOpenError(this.id, this._activeShiftId!);
    }
    this._activeShiftId = shiftId;
    this.updatedAt = new Date();
  }

  public releaseShift(): void {
    if (!this.isOpen()) {
      throw new CashRegisterNotOpenError(this.id);
    }
    this._activeShiftId = null;
    this.updatedAt = new Date();
  }

  public toJSON(): CashRegisterJSON {
    return {
      schemaVersion: CASHIER_SCHEMA_VERSION,
      id: this.id,
      name: this.name,
      branchId: this.branchId,
      currency: this.currency,
      status: this._status,
      activeShiftId: this._activeShiftId,
      maxCashThreshold: this.maxCashThreshold?.toDecimal(),
      carryOverFloat: this._carryOverFloat?.toDecimal(),
      carryOverBreakdown: this._carryOverBreakdown?.toJSON(),
      lastZReportNumber: this._lastZReportNumber,
      isOpen: this.isOpen(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
