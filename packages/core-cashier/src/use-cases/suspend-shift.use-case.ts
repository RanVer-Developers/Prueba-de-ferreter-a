import { ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { ShiftLockedEvent, ShiftSuspendedEvent } from '../domain/events/cashier-events.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface SuspendShiftDTO {
  shiftId: string;
  reason: string;
  mode?: 'SUSPEND' | 'LOCK'; // SUSPEND para pausa/colación, LOCK para bloqueo de terminal
  authorizedBy?: UserSummary;
}

/**
 * Caso de uso: Pausar o bloquear temporalmente un turno activo de caja.
 */
export class SuspendShiftUseCase {
  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher
  ) {}

  public async execute(dto: SuspendShiftDTO): Promise<CashShift> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (dto.mode === 'LOCK') {
      shift.lock(dto.reason);
      if (this.publishEvent) {
        await this.publishEvent(new ShiftLockedEvent(shift.id, dto.reason));
      }
    } else {
      shift.suspend(dto.reason, dto.authorizedBy);
      if (this.publishEvent) {
        await this.publishEvent(new ShiftSuspendedEvent(shift.id, dto.reason, dto.authorizedBy));
      }
    }

    await this.shiftRepo.save(shift);
    return shift;
  }
}
