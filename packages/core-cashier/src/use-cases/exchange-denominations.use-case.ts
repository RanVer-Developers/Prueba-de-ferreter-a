import { ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { DenominationExchangeRecord } from '../domain/entities/cash-shift.js';
import { DenominationsExchangedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface ExchangeDenominationsDTO {
  exchangeId: string;
  shiftId: string;
  /** Billetes/monedas que entran a la gaveta (ej. un billete de $500). */
  inBreakdownCounts: Record<number, number>;
  /** Billetes/monedas que salen de la gaveta (ej. cinco billetes de $100). */
  outBreakdownCounts: Record<number, number>;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  reason?: string;
  idempotencyKey?: string;
}

export interface ExchangeDenominationsOptions {
  features?: CashierFeatureProfile;
  requireSupervisor?: boolean;
  authorizationPolicy?: IAuthorizationPolicy;
}

/**
 * Caso de uso: Cambio de denominaciones en gaveta ("feria" / bill break).
 * Intercambia billetes/monedas de igual valor total sin alterar el saldo contable del turno.
 */
export class ExchangeDenominationsUseCase {
  private readonly features: CashierFeatureFlags;
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: ExchangeDenominationsOptions = {}
  ) {
    this.features = resolveCashierFeatures(options.features);
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: ExchangeDenominationsDTO): Promise<DenominationExchangeRecord> {
    assertFeatureEnabled(this.features, 'denominationExchange');

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (this.options.requireSupervisor || dto.authorizedBy) {
      this.authorizationPolicy.assertCanAuthorize('OPEN_DRAWER_NO_SALE', dto.authorizedBy, dto.performedBy);
    }

    const inBreakdown = new CashBreakdown(dto.inBreakdownCounts, shift.currency);
    const outBreakdown = new CashBreakdown(dto.outBreakdownCounts, shift.currency);

    const isExistingReplay = dto.idempotencyKey
      ? shift.denominationExchangeHistory.some((r) => r.idempotencyKey === dto.idempotencyKey)
      : false;

    const record = shift.exchangeDenominations(
      dto.exchangeId,
      inBreakdown,
      outBreakdown,
      dto.performedBy,
      dto.reason,
      dto.authorizedBy,
      dto.idempotencyKey
    );

    if (!isExistingReplay) {
      await this.shiftRepo.save(shift);
      if (this.publishEvent) {
        await this.publishEvent(
          new DenominationsExchangedEvent(
            shift.id,
            record.amount,
            dto.performedBy,
            dto.reason,
            dto.authorizedBy
          )
        );
      }
    }

    return record;
  }
}
