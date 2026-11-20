import { ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { ShiftResumedEvent, ShiftUnlockedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface ResumeShiftDTO {
  shiftId: string;
  authorizedBy?: UserSummary;
}

/**
 * Caso de uso: Reanudar o desbloquear un turno de caja previamente pausado.
 */
export class ResumeShiftUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    authorizationPolicy?: IAuthorizationPolicy
  ) {
    this.authorizationPolicy = authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: ResumeShiftDTO): Promise<CashShift> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (dto.authorizedBy) {
      this.authorizationPolicy.assertCanAuthorize('RESUME', dto.authorizedBy, shift.cashier);
    }

    if (shift.isLocked()) {
      shift.unlock(dto.authorizedBy);
      if (this.publishEvent) {
        await this.publishEvent(new ShiftUnlockedEvent(shift.id, dto.authorizedBy));
      }
    } else {
      shift.resume(dto.authorizedBy);
      if (this.publishEvent) {
        await this.publishEvent(new ShiftResumedEvent(shift.id, dto.authorizedBy));
      }
    }

    await this.shiftRepo.save(shift);
    return shift;
  }
}
