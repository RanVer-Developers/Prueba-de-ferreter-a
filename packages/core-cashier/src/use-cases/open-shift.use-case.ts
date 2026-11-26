import { CashRegisterAlreadyOpenError, CashRegisterNotFoundError, InvalidMoneyAmountError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { DomainEvent, ShiftOpenedEvent } from '../domain/events/cashier-events.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { Money } from '../domain/value-objects/money.js';
import { ICashRegisterRepository } from '../repositories/cash-register-repository.interface.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';

export interface OpenShiftDTO {
  shiftId: string;
  cashRegisterId: string;
  cashier: UserSummary;
  initialAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  maxCashThreshold?: number; // Límite máximo de efectivo permitido en gaveta antes de disparar alerta
  openingNotes?: string;
  /**
   * Si es true, el monto de apertura debe coincidir con el fondo retenido en el cierre anterior de esta caja
   * (si lo hubiera); de lo contrario se lanza error. Por defecto false (solo se usa como valor por defecto).
   */
  enforceCarryOverFloat?: boolean;
}

export type EventPublisher = (event: DomainEvent) => Promise<void> | void;

/**
 * Caso de uso: Apertura de turno de caja.
 * Valida disponibilidad de la caja, establece el fondo inicial en gaveta,
 * fija límites de seguridad y activa el turno contable.
 */
export class OpenShiftUseCase {
  constructor(
    private readonly registerRepo: ICashRegisterRepository,
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher
  ) {}

  public async execute(dto: OpenShiftDTO): Promise<CashShift> {
    const register = await this.registerRepo.findById(dto.cashRegisterId);
    if (!register) {
      throw new CashRegisterNotFoundError(dto.cashRegisterId);
    }

    if (register.isOpen()) {
      throw new CashRegisterAlreadyOpenError(dto.cashRegisterId, register.activeShiftId!);
    }

    // Calcular o validar desglose y monto inicial
    let initialBreakdown: CashBreakdown | undefined;
    let initialMoney: Money;

    if (dto.cashBreakdownCounts && Object.keys(dto.cashBreakdownCounts).length > 0) {
      initialBreakdown = new CashBreakdown(dto.cashBreakdownCounts, register.currency);
      const breakdownTotal = initialBreakdown.calculateTotal();

      if (dto.initialAmount !== undefined) {
        const declared = Money.fromDecimal(dto.initialAmount, register.currency);
        if (!declared.equals(breakdownTotal)) {
          throw new InvalidMoneyAmountError(
            dto.initialAmount,
            `El monto declarado (${declared.toString()}) no coincide con el desglose físico (${breakdownTotal.toString()}).`
          );
        }
      }
      initialMoney = breakdownTotal;
    } else if (dto.initialAmount !== undefined) {
      initialMoney = Money.fromDecimal(dto.initialAmount, register.currency);
      if (register.carryOverBreakdown && register.carryOverBreakdown.calculateTotal().equals(initialMoney)) {
        initialBreakdown = register.carryOverBreakdown;
      }
    } else if (register.carryOverFloat) {
      // Sin monto explícito: se hereda el fondo fijo retenido en el cierre anterior (y su desglose físico si existe)
      initialMoney = register.carryOverFloat;
      initialBreakdown = register.carryOverBreakdown;
    } else if (register.carryOverBreakdown) {
      initialBreakdown = register.carryOverBreakdown;
      initialMoney = initialBreakdown.calculateTotal();
    } else {
      initialMoney = Money.zero(register.currency);
    }

    if (dto.enforceCarryOverFloat && register.carryOverFloat && !initialMoney.equals(register.carryOverFloat)) {
      throw new InvalidMoneyAmountError(
        initialMoney.toDecimal(),
        `El monto de apertura debe coincidir con el fondo retenido en el cierre anterior (${register.carryOverFloat.toString()}).`
      );
    }

    // Umbral de alerta de efectivo (del DTO o por defecto de la caja)
    let thresholdMoney: Money | undefined;
    if (dto.maxCashThreshold !== undefined) {
      thresholdMoney = Money.fromDecimal(dto.maxCashThreshold, register.currency);
    } else if (register.maxCashThreshold) {
      thresholdMoney = register.maxCashThreshold;
    }

    const shift = new CashShift({
      id: dto.shiftId,
      cashRegisterId: register.id,
      cashier: dto.cashier,
      currency: register.currency,
      initialBalance: initialMoney,
      initialBreakdown,
      maxCashThreshold: thresholdMoney,
      openingNotes: dto.openingNotes,
    });

    register.assignShift(shift.id);
    register.clearCarryOverFloat();

    await this.shiftRepo.save(shift);
    await this.registerRepo.save(register);

    if (this.publishEvent) {
      await this.publishEvent(new ShiftOpenedEvent(shift, initialMoney));
    }

    return shift;
  }
}
