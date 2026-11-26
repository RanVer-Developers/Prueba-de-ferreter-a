import {
  InvalidMoneyAmountError,
  InvalidVoidTargetError,
  ShiftNotFoundError,
  UnauthorizedVoidError,
} from '../domain/errors/cashier-errors.js';
import { CashMovement, MovementType, UserSummary } from '../domain/entities/cash-movement.js';
import { PaymentVoidedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { Money } from '../domain/value-objects/money.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface VoidTransactionDTO {
  shiftId: string;
  transactionReference: string;
  reason: string;
  authorizedBy: UserSummary;
  voidIdPrefix?: string;
  /** Billetes/monedas devueltos físicamente al cliente si hubo componente en efectivo. */
  returnedBreakdownCounts?: Record<number, number>;
}

export interface VoidTransactionOptions {
  authorizationPolicy?: IAuthorizationPolicy;
  features?: CashierFeatureProfile;
}

/**
 * Caso de uso: Anulación atómica de una transacción completa (todos los movimientos de un `transactionReference`,
 * incluyendo pagos mixtos y propinas asociadas).
 */
export class VoidTransactionUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    options: VoidTransactionOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(dto: VoidTransactionDTO): Promise<CashMovement[]> {
    assertFeatureEnabled(this.features, 'voidTransactions');

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (!dto.authorizedBy || !dto.authorizedBy.id || dto.authorizedBy.id.trim().length === 0) {
      throw new UnauthorizedVoidError(
        dto.transactionReference,
        'Se requiere un supervisor identificado para anular transacciones.'
      );
    }

    // Idempotencia por prefijo
    if (dto.voidIdPrefix) {
      const existing = shift.movements.filter(
        (m) => m.type === MovementType.VOID && m.id.startsWith(`${dto.voidIdPrefix}-`) && m.referenceId === dto.transactionReference
      );
      if (existing.length > 0) {
        return existing;
      }
    }

    const activeTargets = shift.movements.filter(
      (m) => m.referenceId === dto.transactionReference && !m.isVoided && m.type !== MovementType.VOID
    );

    let returned: CashBreakdown | undefined;
    const cashInTotal = activeTargets
      .filter((m) => m.isCashIn())
      .reduce((acc, m) => acc.add(m.amount), Money.zero(shift.currency));
    const cashOutTotal = activeTargets
      .filter((m) => m.isCashOut())
      .reduce((acc, m) => acc.add(m.amount), Money.zero(shift.currency));
    const netCashIn = cashInTotal.subtract(cashOutTotal);

    if (dto.returnedBreakdownCounts && activeTargets.length > 0) {
      if (!netCashIn.isPositive()) {
        throw new InvalidVoidTargetError(
          dto.transactionReference,
          'returnedBreakdownCounts solo aplica cuando la transacción anulada tuvo ingreso neto en efectivo.'
        );
      }
      returned = new CashBreakdown(dto.returnedBreakdownCounts, shift.currency);
      const returnedTotal = returned.calculateTotal();
      if (!returnedTotal.equals(netCashIn)) {
        throw new InvalidMoneyAmountError(
          returnedTotal.toDecimal(),
          `El desglose devuelto (${returnedTotal.toString()}) no coincide con el ingreso en efectivo de la transacción (${netCashIn.toString()}).`
        );
      }
      shift.drawerBreakdown.subtract(returned); // Pre-validación
    }

    const voidMovements = shift.voidTransactionByReference(
      dto.transactionReference,
      dto.reason,
      dto.authorizedBy,
      dto.voidIdPrefix,
      this.authorizationPolicy
    );

    if (returned) {
      shift.updateDrawerStock(undefined, returned);
    }

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      for (const voidMov of voidMovements) {
        const original = shift.findMovementById(voidMov.voidDetails!.voidedMovementId)!;
        await this.publishEvent(
          new PaymentVoidedEvent(shift.id, voidMov, original, dto.authorizedBy, dto.reason)
        );
      }
    }

    return voidMovements;
  }
}
