import { ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { CashShift, ShiftFinancialSummary } from '../domain/entities/cash-shift.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';

export interface GetShiftSummaryResult {
  shift: CashShift;
  summary: ShiftFinancialSummary;
  movementsCount: number;
}

/**
 * Caso de uso: Consultar resumen financiero y métricas de un turno.
 */
export class GetShiftSummaryUseCase {
  constructor(private readonly shiftRepo: ICashShiftRepository) {}

  public async execute(shiftId: string): Promise<GetShiftSummaryResult> {
    const shift = await this.shiftRepo.findById(shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(shiftId);
    }

    const summary = shift.calculateSummary();

    return {
      shift,
      summary,
      movementsCount: shift.movements.length,
    };
  }
}
