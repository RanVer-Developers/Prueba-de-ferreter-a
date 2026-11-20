import {
  MovementNotFoundError,
  ShiftNotFoundError,
  UnauthorizedVoidError,
} from '../domain/errors/cashier-errors.js';
import { CashMovement, MovementType, UserSummary } from '../domain/entities/cash-movement.js';
import { PaymentVoidedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface VoidPaymentDTO {
  shiftId: string;
  movementIdToVoid: string;
  reason: string;
  authorizedBy: UserSummary;
  /**
   * ID del movimiento VOID. Si se reintenta con el mismo ID y la anulación ya existe,
   * se devuelve la anulación original (idempotente).
   */
  voidMovementId?: string;
  /** Billetes/monedas devueltos físicamente al cliente (solo ventas en efectivo): descuenta la existencia de gaveta. */
  returnedBreakdownCounts?: Record<number, number>;
}

/**
 * Caso de uso: Anulación de ventas o cobros con autorización obligatoria de supervisor.
 * El aprobador se valida con una política (rol de supervisor y prohibición de autoaprobación).
 */
export class VoidPaymentUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    authorizationPolicy?: IAuthorizationPolicy
  ) {
    this.authorizationPolicy = authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: VoidPaymentDTO): Promise<CashMovement> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (!dto.authorizedBy || !dto.authorizedBy.id || dto.authorizedBy.id.trim().length === 0) {
      throw new UnauthorizedVoidError(
        dto.movementIdToVoid,
        'Se requiere un supervisor identificado para anular transacciones.'
      );
    }

    // Idempotencia: la anulación ya fue registrada con este ID
    if (dto.voidMovementId) {
      const existing = shift.findMovementById(dto.voidMovementId);
      if (
        existing &&
        existing.type === MovementType.VOID &&
        existing.voidDetails?.voidedMovementId === dto.movementIdToVoid
      ) {
        return existing;
      }
    }

    const originalMovement = shift.findMovementById(dto.movementIdToVoid);
    if (!originalMovement) {
      throw new MovementNotFoundError(dto.movementIdToVoid, shift.id);
    }

    this.authorizationPolicy.assertCanAuthorize('VOID', dto.authorizedBy, originalMovement.performedBy);

    // Pre-validar la devolución física de billetes ANTES de anular (evita estados parciales)
    let returned: CashBreakdown | undefined;
    if (dto.returnedBreakdownCounts && originalMovement.paymentMethod === PaymentMethod.CASH) {
      returned = new CashBreakdown(dto.returnedBreakdownCounts, shift.currency);
      shift.drawerBreakdown.subtract(returned); // lanza si no hay existencias
    }

    const voidMovement = shift.voidMovement(
      dto.movementIdToVoid,
      dto.reason,
      dto.authorizedBy,
      dto.voidMovementId,
      this.authorizationPolicy
    );

    if (returned) {
      shift.updateDrawerStock(undefined, returned);
    }

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      await this.publishEvent(
        new PaymentVoidedEvent(shift.id, voidMovement, originalMovement, dto.authorizedBy, dto.reason)
      );
    }

    return voidMovement;
  }
}
