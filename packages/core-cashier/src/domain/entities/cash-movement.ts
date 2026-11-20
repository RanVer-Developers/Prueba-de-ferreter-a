import { InvalidCashierInputError, InvalidMoneyAmountError } from '../errors/cashier-errors.js';
import { CashBreakdown, CashBreakdownJSON } from '../value-objects/cash-denomination.js';
import { ExchangeRate, ExchangeRateJSON } from '../value-objects/exchange-rate.js';
import { Money } from '../value-objects/money.js';
import { PaymentMethod } from '../value-objects/payment-method.js';

export enum MovementType {
  MANUAL_DEPOSIT = 'MANUAL_DEPOSIT',       // Ingreso manual extraordinario
  MANUAL_WITHDRAWAL = 'MANUAL_WITHDRAWAL', // Salida / Gasto menor de caja (Petty cash)
  SAFE_DROP = 'SAFE_DROP',                 // Retiro parcial por seguridad / remesa a bóveda
  SALE = 'SALE',                           // Cobro por venta o servicio
  REFUND = 'REFUND',                       // Devolución / reembolso al cliente
  TIP = 'TIP',                             // Propina / gratificación recaudada
  TIP_PAYOUT = 'TIP_PAYOUT',               // Liquidación o pago de propinas al personal
  VOID = 'VOID',                           // Anulación reversa de una transacción previa
  ADJUSTMENT = 'ADJUSTMENT',               // Ajuste contable justificado
}

export enum ExpenseCategory {
  CLEANING_SUPPLIES = 'CLEANING_SUPPLIES',     // Insumos de limpieza y mantenimiento
  COURIER_SHIPPING = 'COURIER_SHIPPING',       // Mensajería, envíos o fletes menores
  STORE_SUPPLIES = 'STORE_SUPPLIES',           // Papelería, rollos térmicos, insumos operativos
  EMERGENCY_PURCHASE = 'EMERGENCY_PURCHASE',   // Compra urgente de ingredientes / insumos
  STAFF_ADVANCE = 'STAFF_ADVANCE',             // Anticipo o adelanto menor a empleado
  UTILITIES_SERVICES = 'UTILITIES_SERVICES',   // Pago de servicios menores o estacionamiento
  OTHER = 'OTHER',                             // Otros gastos menores
}

export interface ExpenseDetails {
  category: ExpenseCategory;
  supplierName?: string;
  supplierTaxId?: string;       // RFC, CIF, RUT o NIF del proveedor
  invoiceNumber?: string;       // Número de comprobante o factura fiscal de respaldo
}

export interface TipDetails {
  serverEmployeeId?: string;    // ID del mesero o empleado acreedor de la propina
  serverName?: string;          // Nombre del empleado
  payoutReferenceId?: string;   // ID del movimiento TIP_PAYOUT con el que fue liquidada
}

export interface VoidDetails {
  voidedMovementId: string;     // ID del movimiento original anulado
  reason: string;               // Motivo tipificado de la anulación
  authorizedBy: UserSummary;    // Supervisor que autorizó forzosamente la anulación
  authorizedAt: Date;
}

export interface SafeDropDetails {
  envelopeNumber?: string;      // Número o folio del sobre de seguridad
  bagSealNumber?: string;       // Número del precinto o bolsa plástica numerada
  witness?: UserSummary;        // Testigo / supervisor presente en el depósito
  destinationVault?: string;    // Bóveda de destino o identificación de la caja fuerte
}

export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly role?: string; // CASHIER, SUPERVISOR, MANAGER, ADMIN u otro rol propio del proyecto
}

/**
 * Liquidación física de un cobro en efectivo: lo entregado por el cliente, el vuelto y su desglose.
 * Se guarda en el movimiento para poder reconstruir el resultado original ante reintentos idempotentes.
 */
export interface PaymentSettlement {
  tendered: Money;
  change: Money;
  changeBreakdown?: CashBreakdown;
}

export interface PaymentSettlementJSON {
  tendered: number;
  change: number;
  changeBreakdown?: CashBreakdownJSON;
}

export type AdjustmentDirection = 'IN' | 'OUT';

export interface CashMovementProps {
  id: string;
  shiftId: string;
  type: MovementType;
  amount: Money;
  paymentMethod: PaymentMethod;
  concept: string;
  referenceId?: string;
  performedBy: UserSummary;
  idempotencyKey?: string;
  sequenceNumber?: number;
  exchangeRate?: ExchangeRate;
  foreignAmount?: Money;
  expenseDetails?: ExpenseDetails;
  tipDetails?: TipDetails;
  voidDetails?: VoidDetails;
  safeDropDetails?: SafeDropDetails;
  settlement?: PaymentSettlement;
  adjustmentDirection?: AdjustmentDirection;
  timestamp?: Date;
  isVoided?: boolean;
}

export interface CashMovementJSON {
  id: string;
  shiftId: string;
  type: MovementType;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  concept: string;
  referenceId?: string;
  performedBy: UserSummary;
  idempotencyKey?: string;
  sequenceNumber?: number;
  foreignAmount?: {
    amount: number;
    currency: string;
  };
  exchangeRate?: number;
  exchangeRateDetails?: ExchangeRateJSON;
  expenseDetails?: ExpenseDetails;
  tipDetails?: TipDetails;
  safeDropDetails?: SafeDropDetails;
  settlement?: PaymentSettlementJSON;
  adjustmentDirection?: AdjustmentDirection;
  voidDetails?: {
    voidedMovementId: string;
    reason: string;
    authorizedBy: UserSummary;
    authorizedAt: string;
  };
  isVoided: boolean;
  affectsCashDrawer: boolean;
  timestamp: string;
}

/**
 * Representa cualquier transacción o movimiento financiero registrado en el turno de caja.
 * Incluye trazabilidad para gastos menores categorizados, propinas separadas y auditoría de anulaciones.
 */
export class CashMovement {
  public readonly id: string;
  public readonly shiftId: string;
  public readonly type: MovementType;
  public readonly amount: Money;
  public readonly paymentMethod: PaymentMethod;
  public readonly concept: string;
  public readonly referenceId?: string;
  public readonly performedBy: UserSummary;
  public readonly idempotencyKey?: string;
  public readonly sequenceNumber?: number;
  public readonly exchangeRate?: ExchangeRate;
  public readonly foreignAmount?: Money;
  public readonly expenseDetails?: ExpenseDetails;
  public readonly tipDetails?: TipDetails;
  public readonly voidDetails?: VoidDetails;
  public readonly safeDropDetails?: SafeDropDetails;
  public readonly settlement?: PaymentSettlement;
  public readonly adjustmentDirection?: AdjustmentDirection;
  public readonly timestamp: Date;
  private _isVoided: boolean;

  public constructor(props: CashMovementProps) {
    if (!props.amount.isPositive()) {
      throw new InvalidMoneyAmountError(props.amount.toDecimal(), 'El monto del movimiento debe ser estrictamente positivo.');
    }
    if (!props.concept || props.concept.trim().length === 0) {
      throw new InvalidCashierInputError('El concepto o motivo del movimiento es obligatorio.');
    }

    this.id = props.id.trim();
    this.shiftId = props.shiftId.trim();
    this.type = props.type;
    this.amount = props.amount;
    this.paymentMethod = props.paymentMethod;
    this.concept = props.concept.trim();
    this.referenceId = props.referenceId?.trim();
    this.performedBy = props.performedBy;
    this.idempotencyKey = props.idempotencyKey?.trim();
    this.sequenceNumber = props.sequenceNumber;
    this.exchangeRate = props.exchangeRate;
    this.foreignAmount = props.foreignAmount;
    this.expenseDetails = props.expenseDetails;
    this.tipDetails = props.tipDetails;
    this.voidDetails = props.voidDetails;
    this.safeDropDetails = props.safeDropDetails;
    this.settlement = props.settlement;
    this.adjustmentDirection = props.type === MovementType.ADJUSTMENT ? (props.adjustmentDirection ?? 'IN') : undefined;
    this.timestamp = props.timestamp || new Date();
    this._isVoided = props.isVoided ?? false;
  }

  /**
   * Reconstruye un movimiento desde su JSON (rehidratación desde persistencia o sincronización offline).
   */
  public static fromJSON(json: CashMovementJSON): CashMovement {
    const currency = json.currency;
    return new CashMovement({
      id: json.id,
      shiftId: json.shiftId,
      type: json.type,
      amount: Money.fromDecimal(json.amount, currency),
      paymentMethod: json.paymentMethod,
      concept: json.concept,
      referenceId: json.referenceId,
      performedBy: json.performedBy,
      idempotencyKey: json.idempotencyKey,
      sequenceNumber: json.sequenceNumber,
      exchangeRate: json.exchangeRateDetails ? ExchangeRate.fromJSON(json.exchangeRateDetails) : undefined,
      foreignAmount: json.foreignAmount ? Money.fromDecimal(json.foreignAmount.amount, json.foreignAmount.currency) : undefined,
      expenseDetails: json.expenseDetails,
      tipDetails: json.tipDetails,
      voidDetails: json.voidDetails ? {
        voidedMovementId: json.voidDetails.voidedMovementId,
        reason: json.voidDetails.reason,
        authorizedBy: json.voidDetails.authorizedBy,
        authorizedAt: new Date(json.voidDetails.authorizedAt),
      } : undefined,
      safeDropDetails: json.safeDropDetails,
      adjustmentDirection: json.adjustmentDirection,
      settlement: json.settlement ? {
        tendered: Money.fromDecimal(json.settlement.tendered, currency),
        change: Money.fromDecimal(json.settlement.change, currency),
        changeBreakdown: json.settlement.changeBreakdown ? CashBreakdown.fromJSON(json.settlement.changeBreakdown) : undefined,
      } : undefined,
      timestamp: new Date(json.timestamp),
      isVoided: json.isVoided,
    });
  }

  /**
   * Crea una copia del movimiento con campos reemplazados (los movimientos son inmutables salvo la marca de anulado).
   */
  public with(overrides: Partial<CashMovementProps>): CashMovement {
    return new CashMovement({
      id: this.id,
      shiftId: this.shiftId,
      type: this.type,
      amount: this.amount,
      paymentMethod: this.paymentMethod,
      concept: this.concept,
      referenceId: this.referenceId,
      performedBy: this.performedBy,
      idempotencyKey: this.idempotencyKey,
      sequenceNumber: this.sequenceNumber,
      exchangeRate: this.exchangeRate,
      foreignAmount: this.foreignAmount,
      expenseDetails: this.expenseDetails,
      tipDetails: this.tipDetails,
      voidDetails: this.voidDetails,
      safeDropDetails: this.safeDropDetails,
      settlement: this.settlement,
      adjustmentDirection: this.adjustmentDirection,
      timestamp: this.timestamp,
      isVoided: this._isVoided,
      ...overrides,
    });
  }

  public get isVoided(): boolean {
    return this._isVoided;
  }

  public markAsVoided(): void {
    this._isVoided = true;
  }

  /**
   * Un movimiento VOID es solo el registro de auditoría que neutraliza al original (marcado como anulado):
   * ni el original ni el VOID afectan los saldos, por lo que ninguno cuenta como entrada/salida de efectivo.
   */
  public affectsCashDrawer(): boolean {
    return this.paymentMethod === PaymentMethod.CASH;
  }

  public isCashIn(): boolean {
    if (!this.affectsCashDrawer()) return false;
    return (
      this.type === MovementType.MANUAL_DEPOSIT ||
      this.type === MovementType.SALE ||
      this.type === MovementType.TIP ||
      (this.type === MovementType.ADJUSTMENT && this.adjustmentDirection === 'IN')
    );
  }

  public isCashOut(): boolean {
    if (!this.affectsCashDrawer()) return false;
    return (
      this.type === MovementType.MANUAL_WITHDRAWAL ||
      this.type === MovementType.SAFE_DROP ||
      this.type === MovementType.REFUND ||
      this.type === MovementType.TIP_PAYOUT ||
      (this.type === MovementType.ADJUSTMENT && this.adjustmentDirection === 'OUT')
    );
  }

  public toJSON(): CashMovementJSON {
    return {
      id: this.id,
      shiftId: this.shiftId,
      type: this.type,
      amount: this.amount.toDecimal(),
      currency: this.amount.currency,
      paymentMethod: this.paymentMethod,
      concept: this.concept,
      referenceId: this.referenceId,
      performedBy: this.performedBy,
      idempotencyKey: this.idempotencyKey,
      sequenceNumber: this.sequenceNumber,
      foreignAmount: this.foreignAmount ? {
        amount: this.foreignAmount.toDecimal(),
        currency: this.foreignAmount.currency,
      } : undefined,
      exchangeRate: this.exchangeRate?.rate,
      exchangeRateDetails: this.exchangeRate?.toJSON(),
      expenseDetails: this.expenseDetails,
      tipDetails: this.tipDetails,
      safeDropDetails: this.safeDropDetails,
      adjustmentDirection: this.adjustmentDirection,
      settlement: this.settlement ? {
        tendered: this.settlement.tendered.toDecimal(),
        change: this.settlement.change.toDecimal(),
        changeBreakdown: this.settlement.changeBreakdown?.toJSON(),
      } : undefined,
      voidDetails: this.voidDetails ? {
        voidedMovementId: this.voidDetails.voidedMovementId,
        reason: this.voidDetails.reason,
        authorizedBy: this.voidDetails.authorizedBy,
        authorizedAt: this.voidDetails.authorizedAt.toISOString(),
      } : undefined,
      isVoided: this._isVoided,
      affectsCashDrawer: this.affectsCashDrawer(),
      timestamp: this.timestamp.toISOString(),
    };
  }
}
