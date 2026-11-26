import { InvalidMoneyAmountError, ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import {
  AdjustmentDirection,
  CashMovement,
  ExpenseCategory,
  ExpenseDetails,
  MovementType,
  SafeDropDetails,
  UserSummary,
} from '../domain/entities/cash-movement.js';
import {
  CashLimitExceededEvent,
  CashMovementRecordedEvent,
  SafeDropPerformedEvent,
} from '../domain/events/cashier-events.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface RecordMovementOptions {
  features?: CashierFeatureProfile;
}

export interface RecordMovementDTO {
  movementId: string;
  shiftId: string;
  type: MovementType;
  amount: number;
  paymentMethod?: PaymentMethod;
  concept: string;
  referenceId?: string;
  idempotencyKey?: string;
  expenseCategory?: ExpenseCategory;
  expenseSupplierName?: string;
  expenseSupplierTaxId?: string;
  expenseInvoiceNumber?: string;
  safeDropEnvelopeNumber?: string;
  safeDropSealNumber?: string;
  safeDropWitness?: UserSummary;
  safeDropDestinationVault?: string;
  performedBy: UserSummary;
  allowNegativeCash?: boolean;
  /** Dirección de un AJUSTE (por defecto 'IN'). */
  adjustmentDirection?: AdjustmentDirection;
  /**
   * Billetes/monedas físicos del movimiento en efectivo: ingresan a la gaveta (depósitos/ajuste IN)
   * o salen de ella (gastos, remesas, pagos de propinas, ajuste OUT). Debe sumar exactamente el monto.
   */
  breakdownCounts?: Record<number, number>;
}

/**
 * Caso de uso: Registrar movimientos manuales de caja (ingresos, gastos menores categorizados, remesas a bóveda).
 */
export class RecordMovementUseCase {
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    options: RecordMovementOptions = {}
  ) {
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(dto: RecordMovementDTO): Promise<CashMovement> {
    if (dto.type === MovementType.SAFE_DROP) {
      assertFeatureEnabled(this.features, 'safeDrops');
    }
    if (
      dto.type === MovementType.MANUAL_WITHDRAWAL &&
      ((dto.expenseCategory && dto.expenseCategory !== ExpenseCategory.OTHER) ||
        Boolean(dto.expenseSupplierName) ||
        Boolean(dto.expenseSupplierTaxId) ||
        Boolean(dto.expenseInvoiceNumber))
    ) {
      assertFeatureEnabled(this.features, 'categorizedExpenses');
    }

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    // Reintento idempotente: devolver el movimiento original sin duplicar ni republicar eventos
    if (dto.idempotencyKey) {
      const existing = shift.findMovementByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const moneyAmount = Money.fromDecimal(dto.amount, shift.currency);
    const method = dto.paymentMethod || PaymentMethod.CASH;

    let expenseDetails: ExpenseDetails | undefined;
    if (dto.type === MovementType.MANUAL_WITHDRAWAL) {
      expenseDetails = {
        category: dto.expenseCategory || ExpenseCategory.OTHER,
        supplierName: dto.expenseSupplierName,
        supplierTaxId: dto.expenseSupplierTaxId,
        invoiceNumber: dto.expenseInvoiceNumber,
      };
    }

    let safeDropDetails: SafeDropDetails | undefined;
    if (dto.type === MovementType.SAFE_DROP) {
      safeDropDetails = {
        envelopeNumber: dto.safeDropEnvelopeNumber?.trim(),
        bagSealNumber: dto.safeDropSealNumber?.trim(),
        witness: dto.safeDropWitness,
        destinationVault: dto.safeDropDestinationVault?.trim(),
      };
    }

    const movement = new CashMovement({
      id: dto.movementId,
      shiftId: shift.id,
      type: dto.type,
      amount: moneyAmount,
      paymentMethod: method,
      concept: dto.concept,
      referenceId: dto.referenceId,
      idempotencyKey: dto.idempotencyKey,
      expenseDetails,
      safeDropDetails,
      performedBy: dto.performedBy,
      adjustmentDirection: dto.adjustmentDirection,
    });

    let drawerAdded: CashBreakdown | undefined;
    let drawerDeducted: CashBreakdown | undefined;
    if (dto.breakdownCounts && method === PaymentMethod.CASH) {
      const breakdown = new CashBreakdown(dto.breakdownCounts, shift.currency);
      if (!breakdown.calculateTotal().equals(moneyAmount)) {
        throw new InvalidMoneyAmountError(
          dto.amount,
          `El desglose de billetes (${breakdown.calculateTotal().toString()}) no coincide con el monto del movimiento (${moneyAmount.toString()}).`
        );
      }
      if (movement.isCashIn()) drawerAdded = breakdown;
      else if (movement.isCashOut()) drawerDeducted = breakdown;
    }

    const [finalizedMovement] = shift.recordTransaction([movement], {
      allowNegativeCash: dto.allowNegativeCash,
      drawerAdded,
      drawerDeducted,
    });

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      const remainingCash = shift.calculateExpectedCash();

      if (dto.type === MovementType.SAFE_DROP) {
        await this.publishEvent(
          new SafeDropPerformedEvent(
            shift.id,
            moneyAmount,
            remainingCash,
            dto.concept,
            finalizedMovement.safeDropDetails,
            finalizedMovement.id
          )
        );
      } else {
        await this.publishEvent(
          new CashMovementRecordedEvent(shift.id, finalizedMovement, remainingCash)
        );
      }

      if (shift.isCashLimitExceeded() && shift.maxCashThreshold) {
        const excess = remainingCash.subtract(shift.maxCashThreshold);
        await this.publishEvent(
          new CashLimitExceededEvent(shift.id, remainingCash, shift.maxCashThreshold, excess)
        );
      }
    }

    return finalizedMovement;
  }
}
