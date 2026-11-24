import {
  CrossMethodRefundDisallowedError,
  OriginalSaleNotFoundError,
  RefundExceedsOriginalSaleError,
  ShiftNotFoundError,
  SupervisorApprovalRequiredError,
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

export interface RecordRefundDTO {
  movementId: string;
  shiftId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  concept: string;
  /** Referencia de la venta original (transactionReference del cobro). Vincula el reembolso a la venta. */
  referenceId?: string;
  /** Solo se usa como respaldo cuando la venta original no puede encontrarse en el sistema. */
  originalPaymentMethod?: PaymentMethod;
  disallowCrossMethodRefund?: boolean;    // Forzar antifraude: impedir devolver en efectivo compras con tarjeta
  performedBy: UserSummary;
  allowNegativeCash?: boolean;
  /** Supervisor que aprueba el reembolso (obligatorio si la política exige aprobación). */
  authorizedBy?: UserSummary;
  idempotencyKey?: string;
  /** Billetes/monedas efectivamente entregados al cliente (descuenta la existencia física de la gaveta). */
  paidOutBreakdownCounts?: Record<number, number>;
}

export interface RefundPolicyOptions {
  /** Política de autorización del aprobador (por defecto: supervisor/gerente/admin y no autoaprobación). */
  authorizationPolicy?: IAuthorizationPolicy;
  /** Exigir aprobación de supervisor en todos los reembolsos. */
  requireApproval?: boolean;
  /** Exigir aprobación solo para reembolsos de este monto (en la moneda del turno) o superiores. */
  approvalThreshold?: number;
  /** Exigir que todo reembolso esté vinculado a una venta registrada (referenceId existente). */
  requireLinkedSale?: boolean;
  /** Perfil o mapa de capacidades activas. */
  features?: CashierFeatureProfile;
}

/**
 * Caso de uso: Registrar devoluciones y reembolsos con control antifraude.
 *
 * Cuando se informa `referenceId`, el reembolso se vincula a la venta original registrada
 * (en el turno actual o, si el repositorio lo soporta, en turnos anteriores): no se puede
 * reembolsar más de lo vendido y la regla antifraude por método usa los datos reales de la venta
 * en lugar de confiar en lo que informe el llamador.
 */
export class RecordRefundUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: RefundPolicyOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(dto: RecordRefundDTO): Promise<CashMovement> {
    if (dto.referenceId || this.options.requireLinkedSale) {
      assertFeatureEnabled(this.features, 'linkedRefunds');
    }

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    // Reintento idempotente: devolver el reembolso original
    if (dto.idempotencyKey) {
      const existing = shift.findMovementByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const moneyAmount = Money.fromDecimal(dto.amount, shift.currency);

    // Aprobación de supervisor (si aplica o si se aportó)
    const needsApproval =
      this.options.requireApproval === true ||
      (this.options.approvalThreshold !== undefined && dto.amount >= this.options.approvalThreshold);
    if (needsApproval && !dto.authorizedBy) {
      throw new SupervisorApprovalRequiredError('REFUND', 'Este reembolso requiere la autorización de un supervisor.');
    }
    if (dto.authorizedBy) {
      this.authorizationPolicy.assertCanAuthorize('REFUND', dto.authorizedBy, dto.performedBy);
    }

    // Vinculación con la venta original
    await this.assertLinkedToOriginalSale(dto, moneyAmount, shift.currency, shift.movements, shift.id);

    const movement = new CashMovement({
      id: dto.movementId,
      shiftId: shift.id,
      type: MovementType.REFUND,
      amount: moneyAmount,
      paymentMethod: dto.paymentMethod,
      concept: dto.concept,
      referenceId: dto.referenceId,
      performedBy: dto.performedBy,
      idempotencyKey: dto.idempotencyKey,
    });

    const paidOut = dto.paidOutBreakdownCounts && dto.paymentMethod === PaymentMethod.CASH
      ? new CashBreakdown(dto.paidOutBreakdownCounts, shift.currency)
      : undefined;

    const [finalized] = shift.recordTransaction([movement], {
      allowNegativeCash: dto.allowNegativeCash,
      drawerDeducted: paidOut,
    });

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      const remainingCash = shift.calculateExpectedCash();
      await this.publishEvent(
        new CashMovementRecordedEvent(shift.id, finalized, remainingCash)
      );
    }

    return finalized;
  }

  private async assertLinkedToOriginalSale(
    dto: RecordRefundDTO,
    amount: Money,
    currency: string,
    shiftMovements: ReadonlyArray<CashMovement>,
    shiftId: string
  ): Promise<void> {
    if (!dto.referenceId) {
      if (this.options.requireLinkedSale) {
        throw new OriginalSaleNotFoundError();
      }
      this.assertCrossMethodByCaller(dto);
      return;
    }

    // Reunir movimientos de la misma referencia: turno actual + historial (si el repo lo soporta)
    const related = new Map<string, CashMovement>();
    for (const m of shiftMovements) {
      if (m.referenceId === dto.referenceId) related.set(`${shiftId}:${m.id}`, m);
    }
    if (this.shiftRepo.findMovementsByReferenceId) {
      const history = await this.shiftRepo.findMovementsByReferenceId(dto.referenceId);
      for (const m of history) {
        if (m.shiftId !== shiftId) related.set(`${m.shiftId}:${m.id}`, m);
      }
    }

    const sales = [...related.values()].filter((m) => m.type === MovementType.SALE && !m.isVoided);
    const refunds = [...related.values()].filter((m) => m.type === MovementType.REFUND && !m.isVoided);

    if (sales.length === 0) {
      if (this.options.requireLinkedSale) {
        throw new OriginalSaleNotFoundError(dto.referenceId);
      }
      this.assertCrossMethodByCaller(dto);
      return;
    }

    const sum = (list: CashMovement[]) => list.reduce((acc, m) => acc.add(m.amount), Money.zero(currency));
    const soldTotal = sum(sales);
    const refundedTotal = sum(refunds);
    const refundableTotal = soldTotal.subtract(refundedTotal);

    if (amount.greaterThan(refundableTotal)) {
      throw new RefundExceedsOriginalSaleError(
        dto.referenceId,
        amount.toDecimal(),
        refundableTotal.isNegative() ? 0 : refundableTotal.toDecimal(),
        currency
      );
    }

    if (dto.disallowCrossMethodRefund) {
      const soldByMethod = sum(sales.filter((m) => m.paymentMethod === dto.paymentMethod));
      const refundedByMethod = sum(refunds.filter((m) => m.paymentMethod === dto.paymentMethod));
      const refundableByMethod = soldByMethod.subtract(refundedByMethod);

      if (amount.greaterThan(refundableByMethod)) {
        if (soldByMethod.isZero()) {
          // Se pretende devolver por un método con el que nunca se cobró esta venta
          throw new CrossMethodRefundDisallowedError(dto.paymentMethod, sales[0].paymentMethod);
        }
        throw new RefundExceedsOriginalSaleError(
          dto.referenceId,
          amount.toDecimal(),
          refundableByMethod.isNegative() ? 0 : refundableByMethod.toDecimal(),
          currency,
          dto.paymentMethod
        );
      }
    }
  }

  /**
   * Respaldo cuando no hay venta localizable: se confía en el método original informado por el llamador.
   */
  private assertCrossMethodByCaller(dto: RecordRefundDTO): void {
    if (
      dto.disallowCrossMethodRefund &&
      dto.originalPaymentMethod &&
      dto.paymentMethod === PaymentMethod.CASH &&
      dto.originalPaymentMethod !== PaymentMethod.CASH
    ) {
      throw new CrossMethodRefundDisallowedError(dto.paymentMethod, dto.originalPaymentMethod);
    }
  }
}
