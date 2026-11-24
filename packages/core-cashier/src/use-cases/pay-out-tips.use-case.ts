import {
  InvalidMoneyAmountError,
  ShiftNotFoundError,
} from '../domain/errors/cashier-errors.js';
import { CashMovement, MovementType, UserSummary } from '../domain/entities/cash-movement.js';
import { CashMovementRecordedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface PayOutTipsDTO {
  movementId: string;
  shiftId: string;
  /** Monto a liquidar. Si se omite y se indica `serverEmployeeId`, liquida el total pendiente del empleado. */
  amount?: number;
  serverEmployeeId?: string;
  serverName?: string;
  paymentMethod?: PaymentMethod;
  concept?: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  breakdownCounts?: Record<number, number>;
  allowNegativeCash?: boolean;
  idempotencyKey?: string;
}

export interface PayOutTipsOptions {
  features?: CashierFeatureProfile;
  requireSupervisor?: boolean;
  authorizationPolicy?: IAuthorizationPolicy;
}

/**
 * Caso de uso: Liquidación controlada de propinas (`TIP_PAYOUT`).
 * Impide pagar más propinas de las recaudadas (a nivel turno o por `serverEmployeeId`).
 */
export class PayOutTipsUseCase {
  private readonly features: CashierFeatureFlags;
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: PayOutTipsOptions = {}
  ) {
    this.features = resolveCashierFeatures(options.features);
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: PayOutTipsDTO): Promise<CashMovement> {
    assertFeatureEnabled(this.features, 'tipPayouts');

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (dto.idempotencyKey) {
      const existing = shift.findMovementByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    if (this.options.requireSupervisor || dto.authorizedBy) {
      this.authorizationPolicy.assertCanAuthorize('REFUND', dto.authorizedBy, dto.performedBy);
    }

    const pendingTotal = shift.getUnpaidTipsForEmployee(undefined);
    const unassignedEntry = shift
      .getUnpaidTipsByEmployee()
      .find((e) => e.serverEmployeeId === undefined);
    const pendingForTarget = dto.serverEmployeeId
      ? shift.getUnpaidTipsForEmployee(dto.serverEmployeeId)
      : (unassignedEntry ? unassignedEntry.pending : Money.zero(shift.currency));

    const moneyAmount = dto.amount !== undefined
      ? Money.fromDecimal(dto.amount, shift.currency)
      : pendingForTarget;

    if (!moneyAmount.isPositive()) {
      throw new InvalidMoneyAmountError(
        moneyAmount.toDecimal(),
        'No hay propinas pendientes o el monto a liquidar debe ser mayor a cero.'
      );
    }

    if (moneyAmount.greaterThan(pendingForTarget)) {
      throw new InvalidMoneyAmountError(
        moneyAmount.toDecimal(),
        `El pago de propinas (${moneyAmount.toString()}) excede el saldo pendiente (${pendingForTarget.toString()})${
          dto.serverEmployeeId ? ` para el empleado "${dto.serverEmployeeId}"` : ''
        }.`
      );
    }

    if (moneyAmount.greaterThan(pendingTotal)) {
      throw new InvalidMoneyAmountError(
        moneyAmount.toDecimal(),
        `El pago de propinas (${moneyAmount.toString()}) excede el saldo total de propinas pendientes del turno (${pendingTotal.toString()}).`
      );
    }

    const method = dto.paymentMethod ?? PaymentMethod.CASH;
    let drawerDeducted: CashBreakdown | undefined;
    if (dto.breakdownCounts && method === PaymentMethod.CASH) {
      drawerDeducted = new CashBreakdown(dto.breakdownCounts, shift.currency);
      if (!drawerDeducted.calculateTotal().equals(moneyAmount)) {
        throw new InvalidMoneyAmountError(
          drawerDeducted.calculateTotal().toDecimal(),
          `El desglose de billetes (${drawerDeducted.calculateTotal().toString()}) no coincide con el monto de propinas (${moneyAmount.toString()}).`
        );
      }
    }

    const concept = dto.concept?.trim() ||
      `Liquidación de propinas${dto.serverName ? ` (${dto.serverName})` : dto.serverEmployeeId ? ` (${dto.serverEmployeeId})` : ''}`;

    const movement = new CashMovement({
      id: dto.movementId,
      shiftId: shift.id,
      type: MovementType.TIP_PAYOUT,
      amount: moneyAmount,
      paymentMethod: method,
      concept,
      performedBy: dto.performedBy,
      idempotencyKey: dto.idempotencyKey,
      tipDetails: (dto.serverEmployeeId || dto.serverName)
        ? {
            serverEmployeeId: dto.serverEmployeeId,
            serverName: dto.serverName,
          }
        : undefined,
    });

    const [finalized] = shift.recordTransaction([movement], {
      allowNegativeCash: dto.allowNegativeCash,
      drawerDeducted,
    });

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      await this.publishEvent(
        new CashMovementRecordedEvent(shift.id, finalized, shift.calculateExpectedCash())
      );
    }

    return finalized;
  }
}
