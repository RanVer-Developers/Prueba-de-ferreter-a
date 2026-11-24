import {
  CashRegisterNotFoundError,
  InvalidCashierInputError,
} from '../domain/errors/cashier-errors.js';
import { CashRegister, CashRegisterStatus } from '../domain/entities/cash-register.js';
import { Money } from '../domain/value-objects/money.js';
import { ICashRegisterRepository } from '../repositories/cash-register-repository.interface.js';

export interface CreateCashRegisterDTO {
  id: string;
  name: string;
  branchId?: string;
  currency?: string;
  maxCashThreshold?: number;
  status?: CashRegisterStatus;
}

export interface UpdateCashRegisterDTO {
  id: string;
  name?: string;
  branchId?: string;
  maxCashThreshold?: number | null;
  status?: CashRegisterStatus;
}

/**
 * Caso de uso: Dar de alta una caja registradora.
 */
export class CreateCashRegisterUseCase {
  constructor(private readonly registerRepo: ICashRegisterRepository) {}

  public async execute(dto: CreateCashRegisterDTO): Promise<CashRegister> {
    const id = dto.id.trim();
    if (!id) {
      throw new InvalidCashierInputError('El ID de la caja registradora es obligatorio.');
    }
    const existing = await this.registerRepo.findById(id);
    if (existing) {
      throw new InvalidCashierInputError(`Ya existe una caja registradora con ID "${id}".`);
    }

    const currency = (dto.currency || 'USD').toUpperCase().trim();
    const threshold = dto.maxCashThreshold !== undefined
      ? Money.fromDecimal(dto.maxCashThreshold, currency)
      : undefined;

    const register = new CashRegister({
      id,
      name: dto.name,
      branchId: dto.branchId,
      currency,
      status: dto.status ?? CashRegisterStatus.ACTIVE,
      maxCashThreshold: threshold,
    });

    await this.registerRepo.save(register);
    return register;
  }
}

/**
 * Caso de uso: Actualizar configuración o estado operativo de una caja registradora.
 */
export class UpdateCashRegisterUseCase {
  constructor(private readonly registerRepo: ICashRegisterRepository) {}

  public async execute(dto: UpdateCashRegisterDTO): Promise<CashRegister> {
    const register = await this.registerRepo.findById(dto.id);
    if (!register) {
      throw new CashRegisterNotFoundError(dto.id);
    }

    if (dto.name !== undefined) {
      register.rename(dto.name);
    }
    if (dto.branchId !== undefined) {
      register.branchId = dto.branchId;
      register.updatedAt = new Date();
    }
    if (dto.maxCashThreshold !== undefined) {
      if (dto.maxCashThreshold === null) {
        register.setMaxCashThreshold(undefined);
      } else {
        register.setMaxCashThreshold(Money.fromDecimal(dto.maxCashThreshold, register.currency));
      }
    }
    if (dto.status !== undefined) {
      if (dto.status === CashRegisterStatus.ACTIVE) {
        register.activate();
      } else if (dto.status === CashRegisterStatus.INACTIVE) {
        register.deactivate();
      } else if (dto.status === CashRegisterStatus.MAINTENANCE) {
        register.setMaintenance();
      }
    }

    await this.registerRepo.save(register);
    return register;
  }
}
